const DEFAULT_DESIGN_DATA_OFFSET = 0x4000;
const DIRECTORY_FIXED_BYTES = 2;
const DIRECTORY_BYTES_PER_DESIGN = 9;

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

/** Exact incremental storage cost observed for one design in the P7H layout. */
export function designStorageBytes(design) {
  if (!design || !Number.isSafeInteger(design.cardBlobBytes) || design.cardBlobBytes < 0) {
    throw new TypeError("design.cardBlobBytes must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(design.colorCount) || design.colorCount < 1 || design.colorCount > 64) {
    throw new TypeError("design.colorCount must be an integer from 1 through 64");
  }
  return design.cardBlobBytes + DIRECTORY_BYTES_PER_DESIGN + design.colorCount;
}

/** Calculate exact occupied/free storage for a compacted P7H write plan. */
export function summarizeCardStorage(designs, capacityBytes) {
  if (!Array.isArray(designs)) throw new TypeError("designs must be an array");
  validateOffset(capacityBytes, "capacityBytes");
  if (capacityBytes < DEFAULT_DESIGN_DATA_OFFSET) {
    throw new RangeError("capacityBytes is smaller than the reserved card header");
  }
  const payloadBytes = designs.reduce((sum, design) => sum + design.cardBlobBytes, 0);
  const directoryBytes = DIRECTORY_FIXED_BYTES + designs.reduce(
    (sum, design) => sum + designStorageBytes(design) - design.cardBlobBytes,
    0,
  );
  const occupiedBytes = DEFAULT_DESIGN_DATA_OFFSET + payloadBytes + directoryBytes;
  return Object.freeze({
    capacityBytes,
    headerBytes: DEFAULT_DESIGN_DATA_OFFSET,
    payloadBytes,
    directoryBytes,
    occupiedBytes,
    freeBytes: capacityBytes - occupiedBytes,
    fits: occupiedBytes <= capacityBytes,
  });
}

export const CARD_LAYOUT = Object.freeze({
  DEFAULT_DESIGN_DATA_OFFSET,
  DIRECTORY_FIXED_BYTES,
  DIRECTORY_BYTES_PER_DESIGN,
});
