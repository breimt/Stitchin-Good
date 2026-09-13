import assert from "node:assert/strict";
import test from "node:test";
import { layoutInkstitchText, parseInkstitchFontManifest }
  from "../src/fonts/inkstitch-manifest.js";

const manifest = {
  name: "Test Satin", glyphs: ["A", "V", "?"], default_glyph: "?", units_per_em: 100,
  size: 10, horiz_adv_x_default: 50, horiz_adv_x_space: 30,
  horiz_adv_x: { A: 60, V: 55, "?": 40 },
  kerning_pairs: { "A V": 10 },
};

test("Ink/Stitch font manifest normalizes standalone layout metadata", () => {
  const font = parseInkstitchFontManifest(JSON.stringify(manifest));
  assert.equal(font.name, "Test Satin");
  assert.deepEqual(font.glyphs, ["A", "V", "?"]);
  assert.equal(font.nominalSizeMm, 10);
  assert.throws(() => parseInkstitchFontManifest({ ...manifest, units_per_em: 0 }), /positive/);
});

test("text layout applies advances, kerning, scale, and default glyphs", () => {
  const run = layoutInkstitchText(manifest, "AVX", { heightMm: 20 });
  assert.deepEqual(run.placements, [
    { glyph: "A", requested: "A", xMm: 0 },
    { glyph: "V", requested: "V", xMm: 10 },
    { glyph: "?", requested: "X", xMm: 21 },
  ]);
  assert.equal(run.widthMm, 29);
  assert.deepEqual(run.missingGlyphs, ["X"]);

  const spaced = layoutInkstitchText(manifest, "A V");
  assert.deepEqual(spaced.placements.map(({ glyph, xMm }) => ({ glyph, xMm })), [
    { glyph: "A", xMm: 0 }, { glyph: "V", xMm: 9 },
  ]);
  assert.equal(spaced.widthMm, 14.5);
});
