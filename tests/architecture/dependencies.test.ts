import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const normalize = (value: string) => value.replaceAll("\\", "/");
function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sources(file)
      : /\.tsx?$/.test(file)
        ? [file]
        : [];
  });
}
const config = ts.readConfigFile(
  path.join(root, "tsconfig.json"),
  ts.sys.readFile,
);
const compilerOptions = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  root,
).options;
const files = sources(sourceRoot);
const trees = new Map(
  files.map((file) => [
    normalize(file),
    ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    ),
  ]),
);
interface Edge {
  from: string;
  specifier: string;
  target?: string;
}
const edges: Edge[] = [];
function visit(tree: ts.Node, callback: (node: ts.Node) => void) {
  callback(tree);
  ts.forEachChild(tree, (child) => visit(child, callback));
}
for (const [from, tree] of trees) {
  visit(tree, (node) => {
    let literal: ts.Expression | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      literal = node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      literal = node.arguments[0];
    if (!literal || !ts.isStringLiteralLike(literal)) return;
    const specifier = literal.text;
    const target = ts.resolveModuleName(
      specifier,
      from,
      compilerOptions,
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    edges.push({ from, specifier, target: target && normalize(target) });
  });
}
const instrument = (file: string) =>
  /\/src\/instruments\/([^/]+)\//.exec(file)?.[1];
const relative = (file: string) => normalize(path.relative(root, file));

describe("enforced plugin dependency boundaries (TypeScript-resolved imports)", () => {
  it("prohibits imports across instrument directories, including re-exports and dynamic imports", () => {
    const violations = edges.filter(
      (edge) =>
        instrument(edge.from) &&
        edge.target &&
        instrument(edge.target) &&
        instrument(edge.from) !== instrument(edge.target),
    );
    expect(
      violations.map((edge) => `${relative(edge.from)} -> ${edge.specifier}`),
    ).toEqual([]);
  });

  it("prohibits concrete plugin imports from app, core and audio", () => {
    const violations = edges.filter(
      (edge) =>
        /\/src\/(?:app|core|audio)\//.test(edge.from) &&
        edge.target &&
        instrument(edge.target),
    );
    expect(
      violations.map((edge) => `${relative(edge.from)} -> ${edge.specifier}`),
    ).toEqual([]);
  });

  it("keeps every generator and its transitive dependencies free of audio, React, DOM and global random", () => {
    const violations = new Set<string>();
    for (const entry of files.filter((file) =>
      /[\\/]generator\.ts$/.test(file),
    )) {
      const visited = new Set<string>();
      const inspect = (file: string) => {
        if (visited.has(file)) return;
        visited.add(file);
        const tree = trees.get(file);
        if (!tree) return;
        visit(tree, (node) => {
          if (
            ts.isIdentifier(node) &&
            [
              "window",
              "document",
              "AudioContext",
              "OfflineAudioContext",
              "navigator",
            ].includes(node.text)
          )
            violations.add(`${relative(file)} uses ${node.text}`);
          if (
            ts.isPropertyAccessExpression(node) &&
            node.name.text === "random" &&
            node.expression.getText(tree).endsWith("Math")
          )
            violations.add(`${relative(file)} uses Math.random`);
          if (
            ts.isElementAccessExpression(node) &&
            node.argumentExpression &&
            ts.isStringLiteralLike(node.argumentExpression) &&
            node.argumentExpression.text === "random" &&
            node.expression.getText(tree).endsWith("Math")
          )
            violations.add(`${relative(file)} uses Math['random']`);
        });
        for (const edge of edges.filter((edge) => edge.from === file)) {
          if (
            /^(?:tone|react|react-dom)(?:\/|$)/.test(edge.specifier) ||
            (edge.target && /\/src\/audio\//.test(edge.target))
          )
            violations.add(`${relative(file)} imports ${edge.specifier}`);
          if (edge.target) inspect(edge.target);
        }
      };
      inspect(normalize(entry));
    }
    expect([...violations]).toEqual([]);
  });

  it("keeps Vite plugin discovery lazy", () => {
    const tree = trees.get(
      normalize(path.join(sourceRoot, "app", "discoverPlugins.ts")),
    )!;
    const globCalls: ts.CallExpression[] = [];
    visit(tree, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "glob"
      )
        globCalls.push(node);
    });
    expect(globCalls.length).toBeGreaterThan(0);
    for (const call of globCalls)
      expect(call.getText(tree)).not.toMatch(/eager\s*:\s*true/);
  });

  it("requires each available plugin to own its complete minimal structure", () => {
    const directory = path.join(sourceRoot, "instruments");
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())) {
      for (const required of [
        "index.ts",
        "manifest.ts",
        "generator.ts",
        "voice.ts",
        "samples",
        "__tests__",
      ]) {
        expect(
          fs.existsSync(path.join(directory, entry.name, required)),
          `${entry.name}/${required}`,
        ).toBe(true);
      }
    }
  });
});
