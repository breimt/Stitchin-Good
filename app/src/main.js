import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import { searchDesignRecords } from "./catalog/design-catalog.js";
import { scanDesignLibrary } from "./catalog/node-library.js";
import {
  buildPesV1FromCardDesign,
  parseEcsCardImage,
  verifyReconstructedDesign,
} from "./formats/card-image.js";
import { buildEcsDesignBlob, decodePecColorThumbnail, decodePecStitchPlan } from "./formats/pes-v1.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let currentLibrary = null;
let currentCard = null;
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

function cardDesignById(id) {
  return currentCard?.designs.find((record) => record.id === id) ?? null;
}

function bytesEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function matchLibraryRecord(cardDesign) {
  const candidates = currentLibrary?.records.filter((record) =>
    record.supported && record.cardBlobBytes === cardDesign.length) ?? [];
  for (const record of candidates) {
    try {
      const pes = await fs.readFile(record.filePath);
      if (bytesEqual(buildEcsDesignBlob(pes), cardDesign.bytes)) return record;
    } catch {
      // A library file can disappear after indexing; it simply cannot supply a name.
    }
  }
  return null;
}

async function inspectCardImage(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!bytes) throw new TypeError("card image must be a Uint8Array");
  currentCard = Object.freeze({ bytes: bytes.slice(), parsed: null, designs: Object.freeze([]) });
  const parsed = parseEcsCardImage(bytes);
  const designs = [];
  for (const design of parsed.designs) {
    const match = await matchLibraryRecord(design);
    designs.push(Object.freeze({
      ...design,
      label: match?.fileName.replace(/\.pes$/i, "") || match?.label || design.label,
      originalLabel: design.label,
      fileName: match?.fileName ?? null,
      relativePath: match?.relativePath ?? null,
      sourceMatched: Boolean(match),
    }));
  }
  currentCard = Object.freeze({ bytes: bytes.slice(), parsed, designs: Object.freeze(designs) });
  return publicCard();
}

function publicCard() {
  if (!currentCard) return null;
  return {
    capacityBytes: currentCard.parsed.capacityBytes,
    occupiedBytes: currentCard.parsed.occupiedBytes,
    freeBytes: currentCard.parsed.freeBytes,
    designCount: currentCard.designs.length,
    designs: currentCard.designs.map((design) => ({
      id: design.id,
      label: design.label,
      fileName: design.fileName,
      relativePath: design.relativePath,
      sourceMatched: design.sourceMatched,
      cardBytes: design.length,
      widthMm: design.widthMm,
      heightMm: design.heightMm,
      colorCount: design.colorCount,
      stitchCount: design.stitches,
    })),
  };
}

function cardDesignPes(record) {
  const pes = buildPesV1FromCardDesign(record, record.label);
  if (!verifyReconstructedDesign(record, pes)) throw new Error("exported PES did not preserve the card design payload");
  return pes;
}

function safeFileBase(value) {
  const base = String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/[. ]+$/g, "").trim();
  return base || "Card Design";
}

async function nextAvailablePath(directory, baseName, extension) {
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = path.join(directory, `${baseName}${suffix === 0 ? "" : ` (${suffix + 1})`}${extension}`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("could not choose a unique export file name");
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

  ipcMain.handle("card:inspect", async (_event, bytes) => inspectCardImage(bytes));

  ipcMain.handle("card:thumbnail", (_event, id) => {
    const record = cardDesignById(id);
    if (!record) return null;
    return stitchPlanSvg(decodePecStitchPlan(cardDesignPes(record)));
  });

  ipcMain.handle("card:details", (_event, id) => {
    const record = cardDesignById(id);
    if (!record) return null;
    const pes = cardDesignPes(record);
    const plan = decodePecStitchPlan(pes);
    return {
      id: record.id,
      label: record.label,
      fileName: record.fileName ?? `${record.originalLabel}.pes`,
      relativePath: record.relativePath ?? "Stored on inserted card",
      widthMm: record.widthMm,
      heightMm: record.heightMm,
      stitchCount: record.stitches,
      colorCount: record.colorCount,
      pesVersion: 1,
      pesBytes: pes.length,
      cardBlobBytes: record.length,
      previewSvg: stitchPlanSvg(plan),
      steps: plan.steps.map((step) => ({
        number: step.number,
        paletteIndex: step.paletteIndex,
        color: step.color,
        colorName: step.colorName,
        stitchCount: step.stitchCount,
        previewSvg: stitchPlanSvg(plan, step.number),
      })),
    };
  });

  ipcMain.handle("card:save-backup", async () => {
    if (!currentCard) throw new Error("read a card before saving a backup");
    const date = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save exact card backup",
      defaultPath: `ECS-card-backup-${date}.img`,
      filters: [{ name: "ECS card image", extensions: ["img"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, currentCard.bytes);
    return result.filePath;
  });

  ipcMain.handle("card:export-design", async (_event, id) => {
    const record = cardDesignById(id);
    if (!record) throw new Error("card design is no longer available");
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export design from card",
      defaultPath: `${safeFileBase(record.label)}.pes`,
      filters: [{ name: "Brother PES design", extensions: ["pes"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, cardDesignPes(record));
    return result.filePath;
  });

  ipcMain.handle("card:export-all", async () => {
    if (!currentCard) throw new Error("read a card before exporting designs");
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose a folder for the card export",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const date = new Date().toISOString().slice(0, 10);
    const exportDirectory = await nextAvailablePath(result.filePaths[0], `ECS Card Export ${date}`, "");
    await fs.mkdir(exportDirectory);
    for (const [index, record] of currentCard.designs.entries()) {
      const numbered = `${String(index + 1).padStart(2, "0")} - ${safeFileBase(record.label)}`;
      await fs.writeFile(path.join(exportDirectory, `${numbered}.pes`), cardDesignPes(record));
    }
    await fs.writeFile(path.join(exportDirectory, "card-backup.img"), currentCard.bytes);
    return { directory: exportDirectory, count: currentCard.designs.length };
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
