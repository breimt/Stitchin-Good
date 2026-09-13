import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDesignRecord,
  searchDesignRecords,
  summarizeSelection,
} from "../src/catalog/design-catalog.js";
import { decodePecThumbnail } from "../src/formats/pes-v1.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const moonPath = path.join(
  repositoryRoot,
  "Designs", "OeSDVolume3", "10218 Mini Pack A", "NV089Moon.pes",
);
const fixtureAvailable = fs.existsSync(moonPath);

test("catalog records expose searchable transfer metadata", {
  skip: fixtureAvailable ? false : "local PES corpus is unavailable",
}, () => {
  const bytes = fs.readFileSync(moonPath);
  const record = createDesignRecord({
    filePath: moonPath,
    relativePath: "OeSDVolume3/10218 Mini Pack A/NV089Moon.pes",
    bytes,
  });

  assert.equal(record.supported, true);
  assert.equal(record.label, "NV089Moon");
  assert.equal(record.pesVersion, 1);
  assert.equal(record.cardBlobBytes, 1_048);
  assert.equal(record.cardStorageBytes, 1_058);
  assert.ok(record.widthMm > 0);
  assert.ok(record.heightMm > 0);
  assert.ok(record.stitchCount > 0);
  assert.equal(record.colorCount, 1);

  const thumbnail = decodePecThumbnail(bytes);
  assert.deepEqual([thumbnail.width, thumbnail.height], [48, 38]);
  assert.equal(thumbnail.pixels.length, 48 * 38);
  assert.ok(thumbnail.pixels.some((pixel) => pixel === 1));
});

test("search matches multiple words across folder, label, and filename", () => {
  const records = [
    Object.freeze({
      fileName: "Blue Moon.pes", folder: "Night Collection", supported: true,
      searchText: "blue moon.pes night collection", widthMm: 40, heightMm: 30,
      colorCount: 2, stitchCount: 500, cardBlobBytes: 1_000,
    }),
    Object.freeze({
      fileName: "Sun.pes", folder: "Day Collection", supported: false,
      searchText: "sun.pes day collection", widthMm: null, heightMm: null,
      colorCount: null, stitchCount: null, cardBlobBytes: null,
    }),
  ];

  assert.deepEqual(searchDesignRecords(records, { query: "night moon" }), [records[0]]);
  assert.deepEqual(searchDesignRecords(records, { compatibility: "unsupported" }), [records[1]]);
  assert.deepEqual(searchDesignRecords(records, { maxWidthMm: 50 }), [records[0]]);
});

test("selection summary blocks unsupported or oversized transfers", () => {
  const supported = { supported: true, cardBlobBytes: 600, cardStorageBytes: 610 };
  const unsupported = { supported: false, cardBlobBytes: null, cardStorageBytes: null };
  assert.deepEqual(summarizeSelection([supported], 1_000), {
    designCount: 1,
    supportedCount: 1,
    unsupportedCount: 0,
    usedBytes: 610,
    usableBytes: 1_000,
    remainingBytes: 390,
    fits: true,
  });
  assert.equal(summarizeSelection([supported, unsupported], 1_000).fits, false);
  assert.equal(summarizeSelection([supported, supported], 1_000).fits, false);
});
