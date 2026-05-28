#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

const root = process.cwd();
const packagesDir = join(root, "packages");
const aggregateDirs = new Set(["pi-stuff", "pi-skills", "pi-extensions"]);
const bundleExcludedPackages = new Set(["@howaboua/pi-codex-conversion", "@howaboua/pi-skill-omarchy-help"]);
const packages = readdirSync(packagesDir)
  .filter((dir) => !aggregateDirs.has(dir) && existsSync(join(packagesDir, dir, "package.json")))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(packagesDir, dir, "package.json"), "utf8")) }))
  .filter((entry) => !bundleExcludedPackages.has(entry.pkg.name))
  .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));

function has(kind, entry) {
  return Array.isArray(entry.pkg.pi?.[kind]) && entry.pkg.pi[kind].length > 0;
}

function dependencyMap(filter) {
  const out = {};
  for (const entry of packages.filter(filter)) out[entry.pkg.name] = entry.pkg.version;
  return out;
}

function packageInstallPath(packageName) {
  return packageName.startsWith("@") ? packageName : packageName;
}

function relativeDependencyResourcePath(aggregateName, dependencyName, resource) {
  const fromDir = packageInstallPath(aggregateName);
  const toDir = packageInstallPath(dependencyName);
  const cleanedResource = resource.replace(/^\.\//, "");
  return posix.join(posix.relative(fromDir, toDir), cleanedResource);
}

function piPaths(aggregateName, kind, filter) {
  const paths = [];
  for (const entry of packages.filter(filter)) {
    for (const resource of entry.pkg.pi?.[kind] ?? []) {
      paths.push(relativeDependencyResourcePath(aggregateName, entry.pkg.name, resource));
    }
  }
  return paths;
}

function updateAggregate(dir, filter, includeExtensions, includeSkills) {
  const file = join(packagesDir, dir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.dependencies = dependencyMap(filter);
  delete pkg.bundledDependencies;
  pkg.files = Array.from(new Set([...(pkg.files ?? []), "README.md", "LICENSE"]));
  pkg.pi = {};
  if (includeExtensions) pkg.pi.extensions = piPaths(pkg.name, "extensions", filter);
  if (includeSkills) pkg.pi.skills = piPaths(pkg.name, "skills", filter);
  writeFileSync(file, JSON.stringify(pkg, null, "\t") + "\n");
}

updateAggregate("pi-stuff", () => true, true, true);
updateAggregate("pi-extensions", (entry) => has("extensions", entry), true, false);
updateAggregate("pi-skills", (entry) => has("skills", entry), false, true);
console.log("Synced aggregate package dependencies and Pi resource paths.");
