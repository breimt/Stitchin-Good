#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { buildEcsDesignBlob, parsePesV1 } from "../app/src/formats/pes-v1.js";

const [designsArgument = "Designs"] = process.argv.slice(2);
const designsRoot = path.resolve(designsArgument);

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile() && /\.pes$/i.test(entry.name)) yield fullPath;
  }
}

const versions = new Map();
const compatible = [];
const rejected = [];

for (const filePath of walk(designsRoot)) {
  const bytes = fs.readFileSync(filePath);
  const signature = bytes.subarray(0, 8).toString("ascii");
  versions.set(signature, (versions.get(signature) ?? 0) + 1);

  try {
    const parsed = parsePesV1(bytes);
    compatible.push({
      file: path.relative(process.cwd(), filePath),
      pesBytes: bytes.length,
      cardBlobBytes: buildEcsDesignBlob(bytes).length,
      label: parsed.label,
      widthMm: parsed.widthMm,
      heightMm: parsed.heightMm,
      colorCount: parsed.colorCount,
      stitchCount: parsed.stitches,
      stitchBytes: parsed.stitchBytes,
      iconBytes: parsed.iconBytes,
      iconCount: parsed.iconCount,
    });
  } catch (error) {
    rejected.push({
      file: path.relative(process.cwd(), filePath),
      signature,
      reason: error.message,
    });
  }
}

compatible.sort((left, right) => left.cardBlobBytes - right.cardBlobBytes ||
  left.file.localeCompare(right.file));

const smallestByIconCount = [];
for (const entry of compatible) {
  if (!smallestByIconCount.some((candidate) => candidate.iconCount === entry.iconCount)) {
    smallestByIconCount.push(entry);
  }
}

console.log(JSON.stringify({
  root: designsRoot,
  totalPesFiles: compatible.length + rejected.length,
  signatures: Object.fromEntries([...versions].sort()),
  supportedPesV1Files: compatible.length,
  rejectedFiles: rejected.length,
  smallest: compatible.slice(0, 20),
  smallestByIconCount: smallestByIconCount.slice(0, 20),
  rejectionExamples: rejected.slice(0, 20),
}, null, 2));
