#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packagesDir = join(root, "packages");
const aggregateDirs = new Set(["pi-stuff", "pi-skills", "pi-extensions"]);
const packages = readdirSync(packagesDir)
  .filter((dir) => !aggregateDirs.has(dir) && existsSync(join(packagesDir, dir, "package.json")))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(packagesDir, dir, "package.json"), "utf8")) }))
  .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));

function has(kind, entry) {
  return Array.isArray(entry.pkg.pi?.[kind]) && entry.pkg.pi[kind].length > 0;
}

function dependencyMap(filter) {
  const out = {};
  for (const entry of packages.filter(filter)) out[entry.pkg.name] = entry.pkg.version;
  return out;
}

function bundled(filter) {
  return packages.filter(filter).map((entry) => entry.pkg.name);
}

function piPaths(kind, filter) {
  const paths = [];
  for (const entry of packages.filter(filter)) {
    for (const resource of entry.pkg.pi?.[kind] ?? []) {
      paths.push(`node_modules/${entry.pkg.name}/${resource.replace(/^\.\//, "")}`);
    }
  }
  return paths;
}

function updateAggregate(dir, filter, includeExtensions, includeSkills) {
  const file = join(packagesDir, dir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.dependencies = dependencyMap(filter);
  pkg.bundledDependencies = bundled(filter);
  pkg.files = Array.from(new Set([...(pkg.files ?? []), "README.md", "LICENSE"]));
  pkg.pi = {};
  if (includeExtensions) pkg.pi.extensions = piPaths("extensions", filter);
  if (includeSkills) pkg.pi.skills = piPaths("skills", filter);
  writeFileSync(file, JSON.stringify(pkg, null, "\t") + "\n");
}

updateAggregate("pi-stuff", () => true, true, true);
updateAggregate("pi-extensions", (entry) => has("extensions", entry), true, false);
updateAggregate("pi-skills", (entry) => has("skills", entry), false, true);
console.log("Synced aggregate package dependencies and Pi resource paths.");
