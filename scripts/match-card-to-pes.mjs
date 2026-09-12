#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [imageArgument, designsArgument] = process.argv.slice(2);
if (!imageArgument || !designsArgument) {
  console.error("Usage: node scripts/match-card-to-pes.mjs <card.img> <design-directory>");
  process.exit(2);
}

const imagePath = path.resolve(imageArgument);
const designsPath = path.resolve(designsArgument);
const image = fs.readFileSync(imagePath);
const signatureLength = 24;

function usefulSignature(bytes) {
  const unique = new Set(bytes);
  return unique.size >= 6 && !bytes.every((byte) => byte === 0x00 || byte === 0xff);
}

const imageSignatures = new Set();
for (let offset = 0; offset <= image.length - signatureLength; offset += 1) {
  const signature = image.subarray(offset, offset + signatureLength);
  if (usefulSignature(signature)) imageSignatures.add(signature.toString("base64"));
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile() && /\.pes$/i.test(entry.name)) yield fullPath;
  }
}

const results = [];
let scanned = 0;
for (const pesPath of walk(designsPath)) {
  scanned += 1;
  const pes = fs.readFileSync(pesPath);
  const pecHeader = pes.indexOf(Buffer.from("#PEC"));
  const start = pecHeader >= 0 ? pecHeader : 0;
  let tested = 0;
  let matched = 0;
  for (let offset = start; offset <= pes.length - signatureLength; offset += 32) {
    const signature = pes.subarray(offset, offset + signatureLength);
    if (!usefulSignature(signature)) continue;
    tested += 1;
    if (imageSignatures.has(signature.toString("base64"))) matched += 1;
  }
  if (matched > 0) {
    results.push({
      file: path.relative(process.cwd(), pesPath),
      bytes: pes.length,
      tested,
      matched,
      ratio: tested ? matched / tested : 0,
    });
  }
}

results.sort((left, right) => right.matched - left.matched || right.ratio - left.ratio);
console.log(JSON.stringify({ image: imagePath, imageBytes: image.length, scanned, matches: results.slice(0, 25) }, null, 2));
