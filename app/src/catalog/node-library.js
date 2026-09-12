import fs from "node:fs/promises";
import path from "node:path";

import { createDesignRecord } from "./design-catalog.js";

async function* walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile() && /\.pes$/i.test(entry.name)) yield fullPath;
  }
}

/** Recursively scan a local folder. Intended for Electron's main process. */
export async function scanDesignLibrary(rootPath) {
  const absoluteRoot = path.resolve(rootPath);
  const records = [];
  const errors = [];

  for await (const filePath of walk(absoluteRoot)) {
    try {
      const [bytes, stats] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
      records.push(createDesignRecord({
        filePath,
        relativePath: path.relative(absoluteRoot, filePath),
        bytes,
        modifiedMs: stats.mtimeMs,
      }));
    } catch (error) {
      errors.push(Object.freeze({ filePath, message: error.message }));
    }
  }

  return Object.freeze({
    rootPath: absoluteRoot,
    records: Object.freeze(records),
    errors: Object.freeze(errors),
  });
}
