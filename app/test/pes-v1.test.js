import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildEcsDesignBlob,
  decodePecColorThumbnail,
  decodePecStitchPlan,
  decodePecThumbnail,
  parsePesV1,
} from "../src/formats/pes-v1.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cardPath = path.join(repositoryRoot, "captures", "20260912T002646Z", "card.img");
const designs = [
  {
    path: path.join(repositoryRoot, "Designs", "OeSDVolume1", "11018 By the Sea 2", "WL313Octopus.pes"),
    label: "WL313Octopus",
    offset: 0x4000,
    length: 21_515,
    stitchBytes: 20_143,
    iconBytes: 1_368,
  },
  {
    path: path.join(repositoryRoot, "Designs", "OeSDVolume1", "11009 Holiday 4", "H195KittyOnJackO'Lantern.pes"),
    label: "H195KittyOnJackO",
    offset: 0x940b,
    length: 32_275,
    stitchBytes: 29_307,
    iconBytes: 2_964,
  },
  {
    path: path.join(repositoryRoot, "Designs", "OeSDVolume1", "11009 Holiday 4", "H197TrickOrTreatSkeleton.pes"),
    label: "H197TrickOrTreat",
    offset: 0x1121e,
    length: 12_223,
    stitchBytes: 10_851,
    iconBytes: 1_368,
  },
];

test("invalid and unsupported PES inputs fail closed", () => {
  assert.throws(() => parsePesV1(new Uint8Array(12)), /#PES0001/);
});

test("synthetic PES metadata and thumbnail decode without repository designs", () => {
  const pecOffset = 12;
  const stitchBlockOffset = pecOffset + 512;
  const stitchStream = Uint8Array.of(
    0xf0, 0x7b, 0x00, 0xc8, 0x01, 0xe0, 0x01, 0xb0, 0x01,
    0x0a, 0x7b, 0xff,
  );
  const stitchBlockLength = 7 + stitchStream.length;
  const iconOffset = stitchBlockOffset + stitchBlockLength;
  const bytes = new Uint8Array(iconOffset + (228 * 2));
  bytes.set(Buffer.from("#PES0001", "ascii"), 0);
  new DataView(bytes.buffer).setUint32(8, pecOffset, true);
  bytes.set(Buffer.from("LA:Test Design     \r", "ascii"), pecOffset);
  bytes[pecOffset + 34] = 6;
  bytes[pecOffset + 35] = 38;
  bytes[pecOffset + 48] = 0;
  bytes[pecOffset + 49] = 5;
  bytes[stitchBlockOffset + 2] = stitchBlockLength;
  bytes[stitchBlockOffset + 5] = 0x31;
  bytes[stitchBlockOffset + 6] = 0xff;
  bytes.set(stitchStream, stitchBlockOffset + 7);
  bytes[iconOffset + 1] = 0b00000101;
  bytes[iconOffset + 228 + 1] = 0b00000101;
  bytes[iconOffset + 228 + 6] = 0b00010000; // PEC's non-design frame, x=4/y=1.

  const parsed = parsePesV1(bytes);
  assert.equal(parsed.label, "Test Design");
  assert.equal(parsed.widthMm, 12.3);
  assert.equal(parsed.heightMm, 45.6);
  assert.equal(parsed.colorCount, 1);
  assert.equal(parsed.stitches, 1);
  assert.equal(parsed.ended, true);
  assert.equal(buildEcsDesignBlob(bytes).length, (228 * 2) + 4 + stitchStream.length);

  const thumbnail = decodePecThumbnail(bytes);
  assert.deepEqual([...thumbnail.pixels.subarray(8, 12)], [1, 0, 1, 0]);

  const colorThumbnail = decodePecColorThumbnail(bytes);
  assert.equal(colorThumbnail.colors[0], "#ed171f");
  assert.deepEqual([...colorThumbnail.pixels.subarray(8, 12)], [1, 0, 1, 0]);
  assert.equal(colorThumbnail.pixels[(1 * 48) + 4], 0);

  const stitchPlan = decodePecStitchPlan(bytes);
  assert.equal(stitchPlan.steps[0].colorName, "Red");
  assert.equal(stitchPlan.steps[0].stitchCount, 1);
  assert.equal(stitchPlan.steps[0].path, "M0 0l10 -5");
});

const fixtureAvailable = fs.existsSync(cardPath) && designs.every((design) => fs.existsSync(design.path));
test("generated design blobs exactly match the confirmed three-design card", {
  skip: fixtureAvailable ? false : "local golden capture or source PES files are unavailable",
}, () => {
  const card = fs.readFileSync(cardPath);

  for (const design of designs) {
    const pes = fs.readFileSync(design.path);
    const parsed = parsePesV1(pes);
    const blob = buildEcsDesignBlob(pes);

    assert.equal(parsed.label, design.label);
    assert.equal(parsed.stitchBytes, design.stitchBytes);
    assert.equal(parsed.iconBytes, design.iconBytes);
    assert.equal(blob.length, design.length);
    assert.deepEqual(Buffer.from(blob), card.subarray(design.offset, design.offset + design.length));
  }

  assert.equal(designs.at(-1).offset + designs.at(-1).length, 0x141dd);
});
