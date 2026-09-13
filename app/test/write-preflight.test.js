import assert from "node:assert/strict";
import test from "node:test";

import { decodeCardStatus } from "../src/protocol/ecs.js";
import {
  assertWritePreflight,
  evaluateWritePreflight,
  verifyWriteReadback,
} from "../src/workflow/write-preflight.js";
import { syntheticCard } from "../test-fixtures/card-fixture.js";

function fullSizeCard() {
  const card = new Uint8Array(128 * 1024).fill(0xff);
  card.set(syntheticCard(), 0);
  return card;
}

test("exact restore passes every gate for a proven writable status", () => {
  const card = fullSizeCard();
  const result = assertWritePreflight({
    currentCard: card,
    backup: card.slice(),
    writePackage: card.slice(),
    cardStatus: decodeCardStatus(0x22),
    userAuthorized: true,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.exactRestore, true);
});

test("authorization does not override ambiguous status 0x21", () => {
  const card = fullSizeCard();
  const result = evaluateWritePreflight({
    currentCard: card,
    backup: card.slice(),
    writePackage: card.slice(),
    cardStatus: decodeCardStatus(0x21),
    userAuthorized: true,
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.blockers, ["status", "reported-capacity"]);
});

test("stale backup and malformed output independently block erase", () => {
  const card = fullSizeCard();
  const backup = card.slice();
  backup[100] ^= 0xff;
  const output = card.slice();
  output[0] = 0;
  const result = evaluateWritePreflight({
    currentCard: card,
    backup,
    writePackage: output,
    cardStatus: { rawStatus: 0x22, writable: true, capacityBytes: card.length },
    userAuthorized: true,
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.blockers, ["backup", "package-layout"]);
});

test("missing user authorization blocks an otherwise valid restore", () => {
  const card = fullSizeCard();
  const result = evaluateWritePreflight({
    currentCard: card,
    backup: card,
    writePackage: card,
    cardStatus: { rawStatus: 0x22, writable: true, capacityBytes: card.length },
    userAuthorized: false,
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.blockers, ["authorization"]);
});

test("read-back verification identifies the first changed byte", () => {
  const expected = fullSizeCard();
  assert.deepEqual(verifyWriteReadback(expected, expected.slice()), {
    matches: true,
    expectedBytes: expected.length,
    actualBytes: expected.length,
    firstMismatch: null,
  });
  const changed = expected.slice();
  changed[0x4007] ^= 0xff;
  assert.equal(verifyWriteReadback(expected, changed).firstMismatch, 0x4007);
  assert.equal(verifyWriteReadback(expected, changed.subarray(0, -1)).firstMismatch, 0x4007);
});
