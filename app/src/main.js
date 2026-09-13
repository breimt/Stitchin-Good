import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import { searchDesignRecords } from "./catalog/design-catalog.js";
import { scanDesignLibrary } from "./catalog/node-library.js";
import { decodePecColorThumbnail, decodePecStitchPlan } from "./formats/pes-v1.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let currentLibrary = null;
const thumbnailCache = new Map();
let serialSelectionCallback = null;
let serialAccessConfigured = false;

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

function thumbnailSvg(thumbnail, { cropContent = false, background = "#181818" } = {}) {
  let viewX = 0;
  let viewY = 0;
  let viewWidth = thumbnail.width;
  let viewHeight = thumbnail.height;
  if (cropContent) {
    let minimumX = thumbnail.width;
    let minimumY = thumbnail.height;
    let maximumX = -1;
    let maximumY = -1;
    for (let y = 0; y < thumbnail.height; y += 1) {
      for (let x = 0; x < thumbnail.width; x += 1) {
        if (thumbnail.pixels[(y * thumbnail.width) + x] === 0) continue;
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
      }
    }
    if (maximumX >= 0) {
      viewX = Math.max(0, minimumX - 2);
      viewY = Math.max(0, minimumY - 2);
      viewWidth = Math.min(thumbnail.width, maximumX + 3) - viewX;
      viewHeight = Math.min(thumbnail.height, maximumY + 3) - viewY;
    }
  }
  const layers = [];
  for (let colorIndex = 0; colorIndex < thumbnail.colors.length; colorIndex += 1) {
    const paths = [];
    for (let y = 0; y < thumbnail.height; y += 1) {
      let runStart = -1;
      for (let x = 0; x <= thumbnail.width; x += 1) {
        const marked = x < thumbnail.width &&
          thumbnail.pixels[(y * thumbnail.width) + x] === colorIndex + 1;
        if (marked && runStart < 0) runStart = x;
        if (!marked && runStart >= 0) {
          paths.push(`M${runStart} ${y}h${x - runStart}v1H${runStart}z`);
          runStart = -1;
        }
      }
    }
    if (paths.length > 0) layers.push(`<path d="${paths.join("")}" fill="${thumbnail.colors[colorIndex]}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}" shape-rendering="crispEdges"><rect x="${viewX}" y="${viewY}" width="${viewWidth}" height="${viewHeight}" fill="${background}"/>${layers.join("")}</svg>`;
}

function stitchPlanSvg(plan, onlyStep = null) {
  const steps = onlyStep == null
    ? plan.steps
    : plan.steps.filter((step) => step.number === onlyStep);
  const selectedBounds = onlyStep == null ? plan.bounds : steps[0]?.bounds ?? plan.bounds;
  const width = Math.max(1, selectedBounds.maxX - selectedBounds.minX);
  const height = Math.max(1, selectedBounds.maxY - selectedBounds.minY);
  const padding = Math.max(width, height) * 0.035;
  const viewX = selectedBounds.minX - padding;
  const viewY = selectedBounds.minY - padding;
  const viewWidth = width + (padding * 2);
  const viewHeight = height + (padding * 2);
  const paths = steps
    .filter((step) => step.path)
    .map((step) => `<path d="${step.path}" fill="none" stroke="${step.color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}"><rect x="${viewX}" y="${viewY}" width="${viewWidth}" height="${viewHeight}" fill="#e2e2e2"/>${paths}</svg>`;
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
    const plan = decodePecStitchPlan(bytes);
    const svg = plan.steps.some((step) => step.stitchCount > 0)
      ? stitchPlanSvg(plan)
      : thumbnailSvg(decodePecColorThumbnail(bytes));
    thumbnailCache.set(id, svg);
    return svg;
  });

  ipcMain.handle("library:details", async (_event, id) => {
    const record = designById(id);
    if (!record?.supported) return null;
    const bytes = await fs.readFile(record.filePath);
    const plan = decodePecStitchPlan(bytes);
    const previewSvg = stitchPlanSvg(plan);
    const steps = plan.steps.map((step) => ({
      number: step.number,
      paletteIndex: step.paletteIndex,
      color: step.color,
      colorName: step.colorName,
      stitchCount: step.stitchCount,
      previewSvg: stitchPlanSvg(plan, step.number),
    }));
    return { ...publicRecord(record), previewSvg, steps };
  });

  ipcMain.on("serial:select-port", (_event, portId) => {
    if (!serialSelectionCallback) return;
    serialSelectionCallback(typeof portId === "string" ? portId : "");
    serialSelectionCallback = null;
  });
}

function configureSerialAccess(window) {
  if (serialAccessConfigured) return;
  serialAccessConfigured = true;
  const applicationSession = window.webContents.session;
  applicationSession.setPermissionCheckHandler((_webContents, permission) => permission === "serial");
  applicationSession.setDevicePermissionHandler(({ deviceType }) => deviceType === "serial");
  applicationSession.on("select-serial-port", (event, portList, webContents, callback) => {
    event.preventDefault();
    if (serialSelectionCallback) serialSelectionCallback("");
    const ecsAdapter = portList.find((port) => {
      const vendor = String(port.vendorId ?? "").toLowerCase();
      const product = String(port.productId ?? "").toLowerCase();
      return ["067b", "1659"].includes(vendor) && ["23a3", "9123"].includes(product);
    });
    if (ecsAdapter) {
      callback(ecsAdapter.portId);
      return;
    }
    serialSelectionCallback = callback;
    webContents.send("serial:ports", portList.map((port) => ({
      portId: port.portId,
      portName: port.portName,
      displayName: port.displayName,
      vendorId: port.vendorId,
      productId: port.productId,
      serialNumber: port.serialNumber,
      usbDriverName: port.usbDriverName,
    })));
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 780,
    minHeight: 600,
    backgroundColor: "#1e1e1e",
    title: "ECS Card Writer",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      preload: path.join(sourceDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.center();
  configureSerialAccess(mainWindow);

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
