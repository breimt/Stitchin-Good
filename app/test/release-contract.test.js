import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(appRoot, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));

test("macOS release is one universal self-contained DMG", () => {
  assert.deepEqual(packageJson.build.mac.target, [{ target: "dmg", arch: "universal" }]);
  assert.equal(packageJson.build.asar, true);
  assert.deepEqual(packageJson.build.files, ["src/**/*", "ui/**/*", "package.json"]);
  assert.equal(Object.keys(packageJson.dependencies ?? {}).length, 0);
});

test("one canonical macOS workflow tests, builds, and verifies both slices", () => {
  const workflows = fs.readdirSync(path.join(repositoryRoot, ".github", "workflows"))
    .filter((name) => /mac.*\.ya?ml$/i.test(name));
  assert.deepEqual(workflows, ["build-macos.yml"]);
  const workflow = fs.readFileSync(path.join(repositoryRoot, ".github", "workflows", workflows[0]), "utf8");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /lipo -info/);
  assert.match(workflow, /app\/dist\/\*\.dmg/);
});
