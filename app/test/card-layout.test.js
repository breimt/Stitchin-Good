import assert from "node:assert/strict";
import test from "node:test";

import { planCompactedDesignRegion } from "../src/formats/card-layout.js";

test("golden design lengths compact to their observed consecutive offsets", () => {
  const plan = planCompactedDesignRegion([
    { id: "octopus", bytes: new Uint8Array(21_515) },
    { id: "kitty", bytes: new Uint8Array(32_275) },
    { id: "skeleton", bytes: new Uint8Array(12_223) },
  ], { endOffset: 0x18000 });

  assert.deepEqual(plan.placements.map(({ id, start, end, length }) => ({ id, start, end, length })), [
    { id: "octopus", start: 0x4000, end: 0x940b, length: 21_515 },
    { id: "kitty", start: 0x940b, end: 0x1121e, length: 32_275 },
    { id: "skeleton", start: 0x1121e, end: 0x141dd, length: 12_223 },
  ]);
  assert.equal(plan.usedBytes, 66_013);
  assert.equal(plan.freeBytes, 0x18000 - 0x141dd);
});

test("repacking uses aggregate free space instead of preserving holes", () => {
  const plan = planCompactedDesignRegion([
    { id: "preserved-a", bytes: new Uint8Array(100) },
    { id: "new", bytes: new Uint8Array(250) },
    { id: "preserved-b", bytes: new Uint8Array(150) },
  ], { startOffset: 1_000, endOffset: 1_500 });

  assert.deepEqual(plan.placements.map(({ start, end }) => ({ start, end })), [
    { start: 1_000, end: 1_100 },
    { start: 1_100, end: 1_350 },
    { start: 1_350, end: 1_500 },
  ]);
  assert.equal(plan.freeBytes, 0);
});

test("capacity failure is detected before a card can be erased", () => {
  assert.throws(() => planCompactedDesignRegion([
    { bytes: new Uint8Array(501) },
  ], { startOffset: 1_000, endOffset: 1_500 }), /exceeds.*1 bytes/);
});

test("invalid layout inputs fail closed", () => {
  assert.throws(() => planCompactedDesignRegion([], {}), /endOffset/);
  assert.throws(() => planCompactedDesignRegion([{}], { endOffset: 20_000 }), /Uint8Array/);
  assert.throws(() => planCompactedDesignRegion([], { startOffset: 20, endOffset: 10 }), /precede/);
});
