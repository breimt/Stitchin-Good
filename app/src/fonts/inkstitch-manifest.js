function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive number`);
  return value;
}

export function parseInkstitchFontManifest(input) {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  if (!value || typeof value !== "object") throw new TypeError("font manifest must be an object");
  if (typeof value.name !== "string" || !value.name.trim()) throw new TypeError("font name is required");
  if (!Array.isArray(value.glyphs) || value.glyphs.some((glyph) => typeof glyph !== "string")) {
    throw new TypeError("font glyphs must be an array of strings");
  }
  const unitsPerEm = finitePositive(value.units_per_em, "units_per_em");
  const nominalSizeMm = finitePositive(value.size, "size");
  const defaultAdvance = finitePositive(value.horiz_adv_x_default, "horiz_adv_x_default");
  const advances = Object.freeze({ ...(value.horiz_adv_x ?? {}) });
  const kerning = Object.freeze({ ...(value.kerning_pairs ?? {}) });
  for (const [glyph, advance] of Object.entries(advances)) finitePositive(advance, `advance for ${glyph}`);
  for (const [pair, amount] of Object.entries(kerning)) {
    if (!Number.isFinite(amount) || amount < 0) throw new TypeError(`kerning for ${pair} must be non-negative`);
  }
  return Object.freeze({ name: value.name.trim(), glyphs: Object.freeze([...new Set(value.glyphs)]),
    defaultGlyph: typeof value.default_glyph === "string" ? value.default_glyph : "",
    unitsPerEm, nominalSizeMm, defaultAdvance, advances, kerning });
}

/** Calculate deterministic glyph origins/width before stitch generation. */
export function layoutInkstitchText(manifest, text, options = {}) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const font = parseInkstitchFontManifest(manifest);
  const heightMm = options.heightMm ?? font.nominalSizeMm;
  finitePositive(heightMm, "heightMm");
  const mmPerUnit = heightMm / font.unitsPerEm;
  const available = new Set(font.glyphs);
  const placements = [];
  const missing = [];
  let cursorUnits = 0;
  let previous = null;
  for (const requested of text) {
    const glyph = available.has(requested) ? requested : font.defaultGlyph;
    if (!available.has(requested)) missing.push(requested);
    if (!glyph || !available.has(glyph)) continue;
    if (previous != null) cursorUnits -= font.kerning[`${previous} ${glyph}`] ?? 0;
    placements.push(Object.freeze({ glyph, requested, xMm: cursorUnits * mmPerUnit }));
    cursorUnits += font.advances[glyph] ?? font.defaultAdvance;
    previous = glyph;
  }
  return Object.freeze({ fontName: font.name, heightMm, widthMm: cursorUnits * mmPerUnit,
    placements: Object.freeze(placements), missingGlyphs: Object.freeze([...new Set(missing)]) });
}
