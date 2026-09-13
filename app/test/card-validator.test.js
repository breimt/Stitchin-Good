import assert from "node:assert/strict";
import test from "node:test";

import { validateCardStoragePackage } from "../src/formats/card-validator.js";
import { syntheticCard } from "../test-fixtures/card-fixture.js";

function fullSizeCard() {
  const result = new Uint8Array(128 * 1024).fill(0xff);
  result.set(syntheticCard());
  return result;
}

test("validator reports the independently calculated storage extents", () => {
  const report = validateCardStoragePackage(fullSizeCard());
  assert.equal(report.valid, true);
  assert.equal(report.capacityBytes, 128 * 1024);
  assert.equal(report.designCount, 1);
  assert.equal(report.occupiedBytes + report.freeBytes, report.capacityBytes);
  assert.equal(report.erasedTailBytes, report.freeBytes);
});

test("validator rejects nonstandard capacities even if the parser accepts them", () => {
  assert.throws(() => validateCardStoragePackage(syntheticCard()), /unsupported.*capacity/);
});

test("validator rejects data hidden in nominally free storage", () => {
  const card = fullSizeCard();
  card[card.length - 1] = 0;
  assert.throws(() => validateCardStoragePackage(card), /not erased/);
});
