const DEFAULT_DESIGN_DATA_OFFSET = 0x4000;

function validateOffset(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

/**
 * Plan a compacted design region for a complete-card rewrite.
 *
 * Existing and newly selected blobs use the same input shape. This deliberately
 * removes holes instead of trying to split a design across fragmented extents.
 */
export function planCompactedDesignRegion(designs, options = {}) {
  if (!Array.isArray(designs)) throw new TypeError("designs must be an array");
  const startOffset = options.startOffset ?? DEFAULT_DESIGN_DATA_OFFSET;
  const endOffset = options.endOffset;
  validateOffset(startOffset, "startOffset");
  validateOffset(endOffset, "endOffset");
  if (endOffset < startOffset) throw new RangeError("endOffset must not precede startOffset");

  let cursor = startOffset;
  const placements = designs.map((design, index) => {
    if (!design || !(design.bytes instanceof Uint8Array)) {
      throw new TypeError(`designs[${index}].bytes must be a Uint8Array`);
    }
    const start = cursor;
    const end = start + design.bytes.length;
    if (end > endOffset) {
      throw new RangeError(
        `designs do not fit: item ${index} exceeds the design region by ${end - endOffset} bytes`,
      );
    }
    cursor = end;
    return Object.freeze({
      id: design.id ?? String(index),
      bytes: design.bytes,
      start,
      end,
      length: design.bytes.length,
    });
  });

  return Object.freeze({
    startOffset,
    endOffset,
    usedBytes: cursor - startOffset,
    freeBytes: endOffset - cursor,
    placements: Object.freeze(placements),
  });
}

export const CARD_LAYOUT = Object.freeze({
  DEFAULT_DESIGN_DATA_OFFSET,
});
