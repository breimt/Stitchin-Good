import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(appRoot, "ui", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(appRoot, "ui", "app.js"), "utf8");

test("every renderer element id exists in the desktop shell", () => {
  const referencedIds = [...renderer.matchAll(/querySelector\("#([^"]+)"\)/g)]
    .map((match) => match[1]);

  assert.ok(referencedIds.length > 0);
  for (const id of referencedIds) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test("destructive transfer remains visibly disabled", () => {
  assert.match(html, /id="review-transfer"[^>]*disabled/);
  assert.match(html, /Writing not yet enabled/);
});
