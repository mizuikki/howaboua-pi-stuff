#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const changesetDir = join(root, ".changeset");
const packagesDir = join(root, "packages");
const aggregateNames = new Set(["@howaboua/pi-stuff", "@howaboua/pi-extensions", "@howaboua/pi-skills"]);
const aggregateExcludedNames = new Set(["@howaboua/pi-codex-conversion", "@howaboua/pi-skill-omarchy-help"]);
const generatedPath = join(changesetDir, "aggregate-bundles.md");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseChangesetPackages(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];
  return [...match[1].matchAll(/^['"]?([^'":\n]+)['"]?:\s*(patch|minor|major)$/gm)].map((m) => m[1].trim());
}

if (!existsSync(changesetDir)) process.exit(0);

const changedPackages = new Set();
for (const file of readdirSync(changesetDir)) {
  if (!file.endsWith(".md") || file === "README.md" || file === "aggregate-bundles.md") continue;
  const text = readFileSync(join(changesetDir, file), "utf8");
  for (const pkg of parseChangesetPackages(text)) changedPackages.add(pkg);
}

const packageInfos = readdirSync(packagesDir)
  .filter((dir) => existsSync(join(packagesDir, dir, "package.json")))
  .map((dir) => ({ dir, pkg: readJson(join(packagesDir, dir, "package.json")) }));

let needsStuff = false;
let needsExtensions = false;
let needsSkills = false;

for (const { pkg } of packageInfos) {
  if (!changedPackages.has(pkg.name) || aggregateNames.has(pkg.name) || aggregateExcludedNames.has(pkg.name)) continue;
  const hasExtensions = Array.isArray(pkg.pi?.extensions) && pkg.pi.extensions.length > 0;
  const hasSkills = Array.isArray(pkg.pi?.skills) && pkg.pi.skills.length > 0;
  if (hasExtensions || hasSkills) needsStuff = true;
  if (hasExtensions) needsExtensions = true;
  if (hasSkills) needsSkills = true;
}

const aggregateBumps = [];
if (needsStuff && !changedPackages.has("@howaboua/pi-stuff")) aggregateBumps.push("@howaboua/pi-stuff");
if (needsExtensions && !changedPackages.has("@howaboua/pi-extensions")) aggregateBumps.push("@howaboua/pi-extensions");
if (needsSkills && !changedPackages.has("@howaboua/pi-skills")) aggregateBumps.push("@howaboua/pi-skills");

if (aggregateBumps.length === 0) {
  if (existsSync(generatedPath)) writeFileSync(generatedPath, "");
  console.log("No aggregate package changeset needed.");
  process.exit(0);
}

const frontmatter = aggregateBumps.map((name) => `"${name}": patch`).join("\n");
const body = `---\n${frontmatter}\n---\n\nBump aggregate Pi packages to include updated bundled packages.\n`;
writeFileSync(generatedPath, body);
console.log(`Wrote ${generatedPath} for ${aggregateBumps.join(", ")}.`);
