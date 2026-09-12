import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import { searchDesignRecords } from "./catalog/design-catalog.js";
import { scanDesignLibrary } from "./catalog/node-library.js";
import { decodePecThumbnail } from "./formats/pes-v1.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let currentLibrary = null;
const thumbnailCache = new Map();

function publicRecord(record) {
  const { filePath: _filePath, searchText: _searchText, ...result } = record;
  return result;
}

function publicLibrary(library) {
  if (!library) {
    return {
      rootPath: null,
      designCount: 0,
      supportedCount: 0,
      unsupportedCount: 0,
      scanErrorCount: 0,
      folders: [],
    };
  }
  const supportedCount = library.records.filter((record) => record.supported).length;
  return {
    rootPath: library.rootPath,
    designCount: library.records.length,
    supportedCount,
    unsupportedCount: library.records.length - supportedCount,
    scanErrorCount: library.errors.length,
    folders: [...new Set(library.records.map((record) => record.folder).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
  };
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readSavedLibraryPath() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath(), "utf8"));
    return typeof settings.libraryPath === "string" ? settings.libraryPath : null;
  } catch {
    return null;
  }
}

async function saveLibraryPath(libraryPath) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify({ libraryPath }, null, 2)}\n`, "utf8");
}

async function loadLibrary(libraryPath, { persist = false } = {}) {
  currentLibrary = await scanDesignLibrary(libraryPath);
  thumbnailCache.clear();
  if (persist) await saveLibraryPath(currentLibrary.rootPath);
  return publicLibrary(currentLibrary);
}

function designById(id) {
  return currentLibrary?.records.find((record) => record.id === id) ?? null;
}

function thumbnailSvg(thumbnail) {
  const paths = [];
  for (let y = 0; y < thumbnail.height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= thumbnail.width; x += 1) {
      const marked = x < thumbnail.width && thumbnail.pixels[(y * thumbnail.width) + x] === 1;
      if (marked && runStart < 0) runStart = x;
      if (!marked && runStart >= 0) {
        paths.push(`M${runStart} ${y}h${x - runStart}v1H${runStart}z`);
        runStart = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${thumbnail.width} ${thumbnail.height}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#f7f3ea"/><path d="${paths.join("")}" fill="#24352e"/></svg>`;
}

function registerIpc() {
  ipcMain.handle("library:get-state", () => publicLibrary(currentLibrary));

  ipcMain.handle("library:choose-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose embroidery design library",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return loadLibrary(result.filePaths[0], { persist: true });
  });

  ipcMain.handle("library:search", (_event, options = {}) => {
    if (!currentLibrary) return { total: 0, designs: [] };
    const matches = searchDesignRecords(currentLibrary.records, options);
    const limit = Math.min(Math.max(Number(options.limit ?? 250), 1), 500);
    return { total: matches.length, designs: matches.slice(0, limit).map(publicRecord) };
  });

  ipcMain.handle("library:thumbnail", async (_event, id) => {
    if (thumbnailCache.has(id)) return thumbnailCache.get(id);
    const record = designById(id);
    if (!record?.supported) return null;
    const bytes = await fs.readFile(record.filePath);
    const svg = thumbnailSvg(decodePecThumbnail(bytes));
    thumbnailCache.set(id, svg);
    return svg;
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 780,
    minHeight: 600,
    backgroundColor: "#f4f0e7",
    title: "ECS Card Writer",
    webPreferences: {
      preload: path.join(sourceDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  await mainWindow.loadFile(path.join(sourceDirectory, "..", "ui", "index.html"));
}

app.whenReady().then(async () => {
  registerIpc();
  const argument = process.argv.find((value) => value.startsWith("--library="));
  const initialPath = argument
    ? path.resolve(argument.slice("--library=".length))
    : await readSavedLibraryPath();
  if (initialPath) {
    try {
      await loadLibrary(initialPath);
    } catch (error) {
      console.error(`Could not load saved library: ${error.message}`);
    }
  }
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
