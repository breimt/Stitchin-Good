import assert from "node:assert/strict";
import test from "node:test";
import { compareCardImages, extractAsciiStrings, scanBrotherPointerCandidates }
  from "../src/formats/card-analysis.js";

test("card comparison coalesces invariant and varying ranges", () => {
  const first = Uint8Array.of(1, 1, 1, 1, 1, 1);
  const second = Uint8Array.of(1, 2, 3, 1, 1, 4);
  assert.deepEqual(compareCardImages([first, second]), {
    imageCount: 2, imageBytes: 6, variableBytes: 3, invariantBytes: 3,
    regions: [
      { start: 0, endExclusive: 1, length: 1, kind: "invariant" },
      { start: 1, endExclusive: 3, length: 2, kind: "varying" },
      { start: 3, endExclusive: 5, length: 2, kind: "invariant" },
      { start: 5, endExclusive: 6, length: 1, kind: "varying" },
    ],
  });
  assert.throws(() => compareCardImages([first, new Uint8Array(2)]), /same non-zero size/);
});

test("Brother pointer candidates decode banked 16-bit addresses", () => {
  const image = new Uint8Array(0x20020).fill(0xff);
  image.set([0x10, 0x00, 0x40], 3);
  image.set([0x10, 0x00, 0x41], 9);
  image.set([0xff, 0xff, 0x47], 12);
  const candidates = scanBrotherPointerCandidates(image);
  assert.ok(candidates.some(({ source, target }) => source === 3 && target === 0x10));
  assert.ok(candidates.some(({ source, target }) => source === 9 && target === 0x10010));
  assert.ok(!candidates.some(({ source }) => source === 12));
});

test("ASCII extraction reports offsets and applies a minimum length", () => {
  const image = Uint8Array.from([0, ...Buffer.from("brother_embP7H"), 0, ...Buffer.from("abc"), 0]);
  assert.deepEqual(extractAsciiStrings(image), [{ offset: 1, text: "brother_embP7H" }]);
  assert.throws(() => extractAsciiStrings(image, 2), /at least 3/);
});
