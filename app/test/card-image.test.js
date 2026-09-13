import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPesV1FromCardDesign,
  parseEcsCardImage,
  verifyReconstructedDesign,
} from "../src/formats/card-image.js";
import { parsePesV1 } from "../src/formats/pes-v1.js";
import { syntheticCard } from "../test-fixtures/card-fixture.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = path.join(appRoot, "captures", "20260912T002646Z", "card.img");
const fixtureAvailable = fs.existsSync(fixturePath);
const fixture = fixtureAvailable ? new Uint8Array(fs.readFileSync(fixturePath)) : null;

test("parse the confirmed 128 KiB P7H card image and its three designs", {
  skip: fixtureAvailable ? false : "local golden capture is unavailable",
}, () => {
  const card = parseEcsCardImage(fixture);
  assert.equal(card.capacityBytes, 131_072);
  assert.equal(card.designs.length, 3);
  assert.deepEqual(card.designs.map(({ start, end, iconCount }) => ({ start, end, iconCount })), [
    { start: 0x4000, end: 0x940b, iconCount: 6 },
    { start: 0x940b, end: 0x1121e, iconCount: 13 },
    { start: 0x1121e, end: 0x141dd, iconCount: 6 },
  ]);
  assert.deepEqual(card.designs.map((design) => design.colorIndexes), [
    [0x2a, 0x2f, 0x06, 0x1d, 0x17],
    [0x0f, 0x29, 0x0c, 0x1b, 0x0b, 0x22, 0x2a, 0x14, 0x1d, 0x01, 0x14, 0x1d],
    [0x0b, 0x18, 0x2a, 0x28, 0x14],
  ]);
  assert.equal(card.trailer.offset, 0x141dd);
  assert.equal(card.trailer.end, 0x14210);
  assert.equal(card.occupiedBytes, 0x14210);
  assert.equal(card.freeBytes, fixture.length - 0x14210);
});

test("reconstructed PES files preserve each exact card design payload", {
  skip: fixtureAvailable ? false : "local golden capture is unavailable",
}, () => {
  const card = parseEcsCardImage(fixture);
  for (const design of card.designs) {
    const pes = buildPesV1FromCardDesign(design);
    const parsed = parsePesV1(pes);
    assert.equal(parsed.label, design.label);
    assert.deepEqual(parsed.colorIndexes, design.colorIndexes);
    assert.equal(parsed.widthUnits, design.widthUnits);
    assert.equal(parsed.heightUnits, design.heightUnits);
    assert.equal(verifyReconstructedDesign(design, pes), true);
  }
});

test("synthetic card parses and exports without private fixtures", () => {
  const card = parseEcsCardImage(syntheticCard());
  assert.equal(card.designs.length, 1);
  assert.equal(card.designs[0].stitches, 1);
  assert.equal(card.designs[0].widthMm, 10);
  assert.equal(card.designs[0].heightMm, 15);
  assert.deepEqual(card.designs[0].colorIndexes, [5]);
  const pes = buildPesV1FromCardDesign(card.designs[0], "Recovered");
  assert.equal(parsePesV1(pes).label, "Recovered");
  assert.equal(verifyReconstructedDesign(card.designs[0], pes), true);
});

test("reject an image without the P7H card signature", () => {
  const fixture = syntheticCard();
  const invalid = fixture.slice();
  invalid[0] = 0;
  assert.throws(() => parseEcsCardImage(invalid), /not a supported Brother P7H/);
});
