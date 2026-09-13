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
import { buildEcsDesignBlob, parsePesV1 } from "../src/formats/pes-v1.js";

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

function setFrame(icon) {
  for (let y = 0; y < 38; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const marked = ((y === 1 || y === 36) && x >= 4 && x <= 43) ||
        ((y === 2 || y === 35) && (x === 3 || x === 44)) ||
        ((y === 3 || y === 34) && (x === 2 || x === 45)) ||
        ((x === 1 || x === 46) && y >= 4 && y <= 33);
      if (marked) icon[(y * 6) + (x >>> 3)] |= 1 << (x & 7);
    }
  }
}

function syntheticCard() {
  const pecOffset = 12;
  const blockOffset = pecOffset + 512;
  const stitches = Uint8Array.of(
    0xf0, 0x64, 0x00, 0x96, 0x00, 0xe0, 0x01, 0xb0, 0x01,
    0x0a, 0x05, 0xff,
  );
  const blockLength = 7 + stitches.length;
  const iconOffset = blockOffset + blockLength;
  const pes = new Uint8Array(iconOffset + 456);
  pes.set(Buffer.from("#PES0001", "ascii"), 0);
  new DataView(pes.buffer).setUint32(8, pecOffset, true);
  pes.set(Buffer.from("LA:Synthetic       \r", "ascii"), pecOffset);
  pes[pecOffset + 34] = 6;
  pes[pecOffset + 35] = 38;
  pes[pecOffset + 48] = 0;
  pes[pecOffset + 49] = 5;
  pes[blockOffset + 2] = blockLength;
  pes[blockOffset + 5] = 0x31;
  pes[blockOffset + 6] = 0xff;
  pes.set(stitches, blockOffset + 7);
  setFrame(pes.subarray(iconOffset, iconOffset + 228));
  setFrame(pes.subarray(iconOffset + 228, iconOffset + 456));
  const blob = buildEcsDesignBlob(pes);

  const card = new Uint8Array(0x5000).fill(0xff);
  card.set(Buffer.from("brother_embP7H", "ascii"), 0);
  card.set(blob, 0x4000);
  const trailer = 0x4000 + blob.length;
  card.set(Uint8Array.of(
    1, 0xff, 0, 0, 0x40, 0, 0, 1, 0, 0, 0, 5,
  ), trailer);
  return card;
}

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
