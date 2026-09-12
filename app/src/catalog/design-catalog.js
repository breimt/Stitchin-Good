import { buildEcsDesignBlob, parsePesV1 } from "../formats/pes-v1.js";

function bytesSignature(bytes) {
  return String.fromCharCode(...bytes.subarray(0, Math.min(8, bytes.length)));
}

function pathParts(filePath) {
  const parts = filePath.split(/[\\/]/);
  const fileName = parts.pop() ?? filePath;
  return { fileName, folder: parts.join("/") };
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

/** Build the lightweight metadata record stored in the local design index. */
export function createDesignRecord({ filePath, relativePath = filePath, bytes, modifiedMs = null }) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("filePath must be a non-empty string");
  }
  if (!(bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");

  const { fileName, folder } = pathParts(relativePath);
  const signature = bytesSignature(bytes);
  const rawVersion = /^#PES(\d{4})$/.test(signature) ? Number(signature.slice(4)) : null;
  const base = {
    id: relativePath.replace(/\\/g, "/"),
    filePath,
    relativePath: relativePath.replace(/\\/g, "/"),
    fileName,
    folder,
    pesVersion: rawVersion === 1 ? 1 : rawVersion == null ? null : rawVersion / 10,
    pesBytes: bytes.length,
    modifiedMs,
  };

  try {
    const parsed = parsePesV1(bytes);
    const record = {
      ...base,
      label: parsed.label,
      supported: true,
      compatibilityReason: null,
      widthMm: parsed.widthMm,
      heightMm: parsed.heightMm,
      colorCount: parsed.colorCount,
      stitchCount: parsed.stitches,
      jumpCount: parsed.jumps,
      cardBlobBytes: buildEcsDesignBlob(bytes).length,
      thumbnailWidth: parsed.graphicWidth,
      thumbnailHeight: parsed.graphicHeight,
    };
    return Object.freeze({
      ...record,
      searchText: normalized(`${record.fileName} ${record.label} ${record.folder}`),
    });
  } catch (error) {
    const record = {
      ...base,
      label: null,
      supported: false,
      compatibilityReason: error.message,
      widthMm: null,
      heightMm: null,
      colorCount: null,
      stitchCount: null,
      jumpCount: null,
      cardBlobBytes: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
    };
    return Object.freeze({
      ...record,
      searchText: normalized(`${record.fileName} ${record.folder}`),
    });
  }
}

const SORT_VALUE = Object.freeze({
  name: (record) => record.fileName,
  folder: (record) => record.folder,
  width: (record) => record.widthMm,
  height: (record) => record.heightMm,
  colors: (record) => record.colorCount,
  stitches: (record) => record.stitchCount,
  cardSize: (record) => record.cardBlobBytes,
});

/** Search, filter, and sort immutable design records without filesystem access. */
export function searchDesignRecords(records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  const tokens = normalized(options.query).split(/\s+/).filter(Boolean);
  const compatibility = options.compatibility ?? "all";
  if (!["all", "supported", "unsupported"].includes(compatibility)) {
    throw new RangeError("compatibility must be all, supported, or unsupported");
  }

  const folderPrefix = normalized(options.folderPrefix);
  const filtered = records.filter((record) => {
    if (compatibility === "supported" && !record.supported) return false;
    if (compatibility === "unsupported" && record.supported) return false;
    if (folderPrefix && !normalized(record.folder).startsWith(folderPrefix)) return false;
    if (tokens.some((token) => !record.searchText.includes(token))) return false;
    if (options.maxWidthMm != null &&
        !(typeof record.widthMm === "number" && record.widthMm <= options.maxWidthMm)) return false;
    if (options.maxHeightMm != null &&
        !(typeof record.heightMm === "number" && record.heightMm <= options.maxHeightMm)) return false;
    if (options.maxColors != null &&
        !(typeof record.colorCount === "number" && record.colorCount <= options.maxColors)) return false;
    if (options.maxStitches != null &&
        !(typeof record.stitchCount === "number" && record.stitchCount <= options.maxStitches)) return false;
    if (options.maxCardBytes != null &&
        !(typeof record.cardBlobBytes === "number" && record.cardBlobBytes <= options.maxCardBytes)) return false;
    return true;
  });

  const sort = options.sort ?? "name";
  const selector = SORT_VALUE[sort];
  if (!selector) throw new RangeError(`unsupported sort: ${sort}`);
  const direction = options.direction === "desc" ? -1 : 1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return filtered.toSorted((left, right) => {
    const leftValue = selector(left);
    const rightValue = selector(right);
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return direction * (leftValue - rightValue);
    }
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    return direction * collator.compare(String(leftValue), String(rightValue));
  });
}

/** Summarize a multi-selection before layout or destructive operations. */
export function summarizeSelection(records, usableBytes) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  if (!Number.isSafeInteger(usableBytes) || usableBytes < 0) {
    throw new RangeError("usableBytes must be a non-negative safe integer");
  }
  const unsupported = records.filter((record) => !record.supported);
  const usedBytes = records.reduce((sum, record) => sum + (record.cardBlobBytes ?? 0), 0);
  return Object.freeze({
    designCount: records.length,
    supportedCount: records.length - unsupported.length,
    unsupportedCount: unsupported.length,
    usedBytes,
    usableBytes,
    remainingBytes: usableBytes - usedBytes,
    fits: unsupported.length === 0 && usedBytes <= usableBytes,
  });
}
