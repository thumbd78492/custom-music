import { spawn } from "node:child_process";
import { cpSync, createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  ".verification",
  new Date().toISOString().replaceAll(/[:.]/g, "-"),
);
mkdirSync(output, { recursive: true });
const checks = [
  ["typecheck", "node_modules/typescript/bin/tsc", ["--noEmit"]],
  ["vitest", "node_modules/vitest/vitest.mjs", ["run"]],
  ["build", "node_modules/vite/bin/vite.js", ["build"]],
  ["sample-integrity", "scripts/verify-samples.mjs", []],
  ["isolation", "scripts/test-isolation.mjs", []],
  ["e2e", "node_modules/@playwright/test/cli.js", ["test"]],
  ["eslint", "node_modules/eslint/bin/eslint.js", ["."]],
  [
    "prettier",
    "node_modules/prettier/bin/prettier.cjs",
    [
      "--check",
      "src",
      "tests",
      "scripts",
      "docs",
      "plan.md",
      "README.md",
      "CURRENT_STATE.md",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "vite.config.ts",
      "playwright.config.ts",
      "eslint.config.js",
      "index.html",
    ],
  ],
];
const results = [];
console.log(`Evidence directory: ${output}`);
for (const [name, executable, args] of checks) {
  console.log(`Running ${name}`);
  const began = Date.now();
  const logPath = path.join(output, `${name}.log`);
  const log = createWriteStream(logPath);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, executable), ...args],
      {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1" },
      },
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        process.stdout.write(chunk);
        log.write(chunk);
      });
    child.once("error", reject);
    child.once("close", resolve);
  });
  await new Promise((resolve) => log.end(resolve));
  results.push({
    name,
    exitCode,
    passed: exitCode === 0,
    durationMs: Date.now() - began,
    logPath,
  });
  writeFileSync(
    path.join(output, "results.json"),
    `${JSON.stringify({ milestone: process.argv.includes("--m2") ? "M2" : "current", checks: results, humanListening: "Pending" }, null, 2)}\n`,
  );
  if (name === "e2e")
    cpSync(path.join(root, "test-results"), path.join(output, "browser"), {
      recursive: true,
    });
  if (exitCode !== 0) {
    process.exitCode = 1;
    break;
  }
}
console.log(`Verification receipts: ${path.join(output, "results.json")}`);
