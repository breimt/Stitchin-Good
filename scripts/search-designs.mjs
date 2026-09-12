#!/usr/bin/env node

import { scanDesignLibrary } from "../app/src/catalog/node-library.js";
import { searchDesignRecords } from "../app/src/catalog/design-catalog.js";

const [query = "", root = "Designs"] = process.argv.slice(2);
const library = await scanDesignLibrary(root);
const matches = searchDesignRecords(library.records, {
  query,
  compatibility: "all",
  sort: "name",
});

console.log(JSON.stringify({
  rootPath: library.rootPath,
  query,
  indexed: library.records.length,
  scanErrors: library.errors,
  matchCount: matches.length,
  matches: matches.slice(0, 50),
}, null, 2));
