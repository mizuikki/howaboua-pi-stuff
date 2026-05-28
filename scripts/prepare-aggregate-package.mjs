#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("bun", ["run", "aggregate:sync"]);
const markdownDir = join(root, "packages", "pi-markdown-workflows");
if (existsSync(join(markdownDir, "package.json"))) {
  run("bun", ["run", "build"], markdownDir);
}
