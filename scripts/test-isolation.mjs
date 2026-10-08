import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Physical absence is stronger than mocking an unused import. No source files
// are removed; each run gets new, inspectable fixtures below .isolation/.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const instrumentRoot = path.join(root, "src", "instruments");
const available = readdirSync(instrumentRoot, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(path.join(instrumentRoot, entry.name, "index.ts")),
  )
  .map((entry) => entry.name)
  .sort();
const requested = process.argv.slice(2);
for (const id of requested)
  if (!available.includes(id)) throw new Error(`Unknown plugin: ${id}`);
const selected = requested.length ? requested : available;
if (!selected.length) throw new Error("No plugins to isolate");
const runRoot = path.join(
  root,
  ".isolation",
  new Date().toISOString().replaceAll(/[:.]/g, "-"),
);
mkdirSync(runRoot, { recursive: true });
const results = [];
const executables = [
  ["typecheck", "typescript/bin/tsc", ["--noEmit"]],
  ["vitest", "vitest/vitest.mjs", ["run"]],
  ["build", "vite/bin/vite.js", ["build"]],
];

for (const id of selected) {
  const fixture = path.join(runRoot, id);
  mkdirSync(fixture, { recursive: true });
  cpSync(path.join(root, "src"), path.join(fixture, "src"), {
    recursive: true,
    filter: (source) => path.resolve(source) !== instrumentRoot,
  });
  mkdirSync(path.join(fixture, "src", "instruments"), { recursive: true });
  cpSync(
    path.join(instrumentRoot, id),
    path.join(fixture, "src", "instruments", id),
    { recursive: true },
  );
  cpSync(path.join(root, "tests"), path.join(fixture, "tests"), {
    recursive: true,
    filter: (source) => path.basename(source) !== "e2e",
  });
  for (const file of [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
  ])
    cpSync(path.join(root, file), path.join(fixture, file));
  const present = readdirSync(path.join(fixture, "src", "instruments"));
  if (present.length !== 1 || present[0] !== id)
    throw new Error(`Isolation failed: ${present.join(", ")}`);
  console.log(`\n[${id}] physical fixture: ${fixture}; only ${id} exists`);
  const checks = {};
  for (const [name, executable, args] of executables) {
    console.log(`[${id}] ${name}`);
    const result = spawnSync(
      process.execPath,
      [path.join(root, "node_modules", executable), ...args],
      {
        cwd: fixture,
        stdio: "inherit",
        env: { ...process.env, FORCE_COLOR: "0" },
        windowsHide: true,
      },
    );
    checks[name] = result.status === 0 && !result.error;
    if (!checks[name]) {
      results.push({
        id,
        fixture,
        present,
        checks,
        error: result.error?.message,
      });
      writeFileSync(
        path.join(runRoot, "results.json"),
        JSON.stringify(results, null, 2),
      );
      process.exit(result.status || 1);
    }
  }
  results.push({ id, fixture, present, checks });
}
writeFileSync(
  path.join(runRoot, "results.json"),
  JSON.stringify(results, null, 2),
);
console.log(
  `\nPASS: ${selected.length} physical single-plugin fixtures passed typecheck, Vitest and production build.`,
);
console.log(`Evidence: ${path.join(runRoot, "results.json")}`);
