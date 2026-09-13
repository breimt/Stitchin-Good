import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("unattended ECS probe can emit only identification/status commands", () => {
  const script = fs.readFileSync(path.join(repositoryRoot, "scripts", "probe-ecs.ps1"), "utf8");
  const commands = [...script.matchAll(/Command\s*=\s*\[char\]'(.)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(commands)].sort(), ["D", "I", "T", "V"]);
  assert.doesNotMatch(script, /Command\s*=\s*\[char\]'[ERW]'/);
  assert.match(script, /operation = 'read-only-identification'/);
});
