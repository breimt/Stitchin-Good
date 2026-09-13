import { buildCommand, COMMAND, ECS, parseCardStatusResponse } from "../src/protocol/ecs.js";
import { readCardStorage } from "../src/protocol/ecs-transfer.js";

const elements = {
  search: document.querySelector("#search"), folder: document.querySelector("#folder"),
  compatibility: document.querySelector("#compatibility"), sort: document.querySelector("#sort"),
  grid: document.querySelector("#design-grid"), resultCount: document.querySelector("#result-count"),
  libraryCount: document.querySelector("#library-count"), libraryPath: document.querySelector("#library-path"),
  chooseFolder: document.querySelector("#choose-folder"), openFolder: document.querySelector("#open-folder"),
  selectionCount: document.querySelector("#selection-count"), selectionSize: document.querySelector("#selection-size"),
  selectionList: document.querySelector("#selection-list"), clearSelection: document.querySelector("#clear-selection"),
  footerSelection: document.querySelector("#footer-selection"), connectWriter: document.querySelector("#connect-writer"),
  writerIndicator: document.querySelector("#writer-indicator"), writerStatus: document.querySelector("#writer-status"),
  writerDetail: document.querySelector("#writer-detail"), cardKind: document.querySelector("#card-kind"),
  cardCapacity: document.querySelector("#card-capacity"), existingSize: document.querySelector("#existing-size"),
  availableSize: document.querySelector("#available-size"), capacityExisting: document.querySelector("#capacity-existing"),
  capacitySelected: document.querySelector("#capacity-selected"), capacityLabel: document.querySelector("#capacity-label"),
  portDialog: document.querySelector("#port-dialog"), portForm: document.querySelector("#port-form"),
  portList: document.querySelector("#port-list"), cancelPort: document.querySelector("#cancel-port"),
  cancelPortX: document.querySelector("#cancel-port-x"),
  designDialog: document.querySelector("#design-dialog"), detailTitle: document.querySelector("#detail-title"),
  detailFile: document.querySelector("#detail-file"), detailPreview: document.querySelector("#detail-preview"),
  detailMetadata: document.querySelector("#detail-metadata"), stepCount: document.querySelector("#step-count"),
  stepList: document.querySelector("#step-list"), closeDetails: document.querySelector("#close-details"),
  readCard: document.querySelector("#read-card"), readProgress: document.querySelector("#read-progress"),
  readProgressLabel: document.querySelector("#read-progress-label"), cardDesignCount: document.querySelector("#card-design-count"),
  cardFileList: document.querySelector("#card-file-list"), exportAllCard: document.querySelector("#export-all-card"),
  saveCardBackup: document.querySelector("#save-card-backup"),
};

const selected = new Map();
let requestSequence = 0;
let libraryLoaded = false;
let serialPort = null;
let cardState = { capacityBytes: null, existingBytes: null, writable: false, kind: null };
let detailObjectUrls = [];
let cardObjectUrls = [];
let cardDesigns = [];
let cardReadInProgress = false;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
}

function selectedBytes() {
  return [...selected.values()].reduce((sum, record) => sum + (record.cardStorageBytes ?? 0), 0);
}

function updateCapacity() {
  const pending = selectedBytes();
  const { capacityBytes, existingBytes } = cardState;
  elements.selectionSize.textContent = formatBytes(pending);
  elements.cardCapacity.textContent = formatBytes(capacityBytes);
  elements.existingSize.textContent = formatBytes(existingBytes);
  elements.availableSize.classList.remove("error-text");

  if (capacityBytes == null) {
    elements.availableSize.textContent = "—";
    elements.capacityExisting.style.width = "0";
    elements.capacitySelected.style.width = "0";
    elements.capacityLabel.textContent = pending > 0
      ? `${formatBytes(pending)} selected. Connect and read a card to verify free space.`
      : "Connect and read a card to calculate available space.";
    return;
  }

  const selectedPercent = Math.min(100, (pending / capacityBytes) * 100);
  elements.capacitySelected.style.width = `${selectedPercent}%`;
  if (existingBytes == null) {
    elements.availableSize.textContent = "Read required";
    elements.capacityExisting.style.width = "0";
    elements.capacityLabel.textContent = `${formatBytes(pending)} selected (${selectedPercent.toFixed(1)}% of raw card capacity). Existing use is not known yet.`;
    return;
  }

  const existingPercent = Math.min(100, (existingBytes / capacityBytes) * 100);
  const available = capacityBytes - existingBytes - pending;
  elements.capacityExisting.style.width = `${existingPercent}%`;
  elements.availableSize.textContent = available >= 0 ? formatBytes(available) : `${formatBytes(-available)} over`;
  elements.availableSize.classList.toggle("error-text", available < 0);
  elements.capacityLabel.textContent = available >= 0
    ? `${formatBytes(available)} remains after the selected designs.`
    : `Selection exceeds available space by ${formatBytes(-available)}.`;
}

function updateSelection() {
  const records = [...selected.values()];
  const totalBytes = selectedBytes();
  elements.selectionCount.textContent = `${records.length.toLocaleString()} ${records.length === 1 ? "design" : "designs"}`;
  elements.clearSelection.disabled = records.length === 0;
  elements.footerSelection.textContent = `${records.length.toLocaleString()} selected · ${formatBytes(totalBytes)}`;

  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-selection";
    empty.textContent = "Select a design to add it to the transfer plan.";
    elements.selectionList.replaceChildren(empty);
  } else {
    elements.selectionList.replaceChildren(...records.map((record) => {
      const item = document.createElement("div");
      item.className = "selection-item";
      const name = document.createElement("span");
      name.className = "selection-name";
      name.textContent = record.label || record.fileName.replace(/\.pes$/i, "");
      name.title = record.fileName;
      const bytes = document.createElement("span");
      bytes.className = "selection-bytes";
      bytes.textContent = formatBytes(record.cardStorageBytes);
      const remove = document.createElement("button");
      remove.className = "remove-selection";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `Remove ${name.textContent}`;
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", () => {
        selected.delete(record.id);
        updateSelection();
        void loadDesigns();
      });
      item.append(name, bytes, remove);
      return item;
    }));
  }
  updateCapacity();
}

function clearCardUrls() {
  for (const url of cardObjectUrls) URL.revokeObjectURL(url);
  cardObjectUrls = [];
}

async function attachCardThumbnail(image, record) {
  const svg = await window.ecsCard.thumbnail(record.id);
  if (!svg || !image.isConnected) return;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  cardObjectUrls.push(url);
  image.src = url;
}

async function exportCardDesign(record) {
  try {
    const savedPath = await window.ecsCard.exportDesign(record.id);
    if (savedPath) updateWriter({ state: "connected", title: "Design exported", detail: savedPath });
  } catch (error) {
    updateWriter({ state: "error", title: "Export failed", detail: error.message });
  }
}

function renderCardContents(card) {
  clearCardUrls();
  cardDesigns = card?.designs ?? [];
  elements.cardDesignCount.textContent = card
    ? `${card.designCount} ${card.designCount === 1 ? "design" : "designs"}`
    : "Not read";
  elements.exportAllCard.disabled = cardDesigns.length === 0;
  elements.saveCardBackup.disabled = !card;

  if (!card || cardDesigns.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-selection";
    empty.textContent = card ? "No designs were found on this card." : "Read the inserted card to view and recover its designs.";
    elements.cardFileList.replaceChildren(empty);
    return;
  }

  elements.cardFileList.replaceChildren(...cardDesigns.map((record) => {
    const item = document.createElement("article");
    item.className = "card-file";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `View ${record.label}`);
    const preview = document.createElement("div");
    preview.className = "card-file-preview";
    const image = document.createElement("img");
    image.alt = `Preview for ${record.label}`;
    preview.append(image);
    void attachCardThumbnail(image, record);
    const info = document.createElement("div");
    info.className = "card-file-info";
    const name = document.createElement("span");
    name.className = "card-file-name";
    name.textContent = record.label;
    const metadata = document.createElement("span");
    metadata.className = "card-file-meta";
    metadata.textContent = `${record.colorCount} colors · ${record.stitchCount.toLocaleString()} stitches · ${formatBytes(record.cardBytes)}`;
    info.append(name, metadata);
    if (record.sourceMatched) {
      const match = document.createElement("span");
      match.className = "card-file-match";
      match.textContent = "Matched in local library";
      match.title = record.relativePath;
      info.append(match);
    }
    const save = document.createElement("button");
    save.className = "text-button";
    save.type = "button";
    save.textContent = "Export";
    save.addEventListener("click", (event) => {
      event.stopPropagation();
      void exportCardDesign(record);
    });
    const open = () => void openDesignDetails({ ...record, supported: true }, "card");
    item.addEventListener("click", open);
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });
    item.append(preview, info, save);
    return item;
  }));
}

function detail(label, value, className = "") {
  const item = document.createElement("span");
  if (className) item.className = className;
  item.textContent = `${label} ${value}`;
  return item;
}

async function attachThumbnail(image, record) {
  const svg = await window.ecsLibrary.thumbnail(record.id);
  if (!svg || !image.isConnected) return;
  image.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

function svgObjectUrl(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  detailObjectUrls.push(url);
  return url;
}

function detailMetadataRow(label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  row.append(term, description);
  return row;
}

function clearDetailUrls() {
  for (const url of detailObjectUrls) URL.revokeObjectURL(url);
  detailObjectUrls = [];
}

async function openDesignDetails(record, source = "library") {
  clearDetailUrls();
  elements.detailTitle.textContent = record.label || record.fileName.replace(/\.pes$/i, "");
  elements.detailFile.textContent = record.relativePath;
  elements.detailPreview.removeAttribute("src");
  elements.detailPreview.alt = "";
  elements.detailMetadata.replaceChildren();
  elements.stepCount.textContent = "Loading…";
  elements.stepList.replaceChildren();
  elements.designDialog.showModal();

  if (source === "library" && !record.supported) {
    elements.detailMetadata.replaceChildren(
      detailMetadataRow("PES version", record.pesVersion ?? "Unknown"),
      detailMetadataRow("Source size", formatBytes(record.pesBytes)),
      detailMetadataRow("Compatibility", record.compatibilityReason),
    );
    elements.stepCount.textContent = "Unavailable";
    return;
  }

  try {
    const design = source === "card"
      ? await window.ecsCard.details(record.id)
      : await window.ecsLibrary.details(record.id);
    if (!design || !elements.designDialog.open) return;
    elements.detailPreview.src = svgObjectUrl(design.previewSvg);
    elements.detailPreview.alt = `Color stitch preview for ${design.label || design.fileName}`;
    elements.detailMetadata.replaceChildren(
      detailMetadataRow("Dimensions", `${design.widthMm.toFixed(1)} × ${design.heightMm.toFixed(1)} mm`),
      detailMetadataRow("Stitches", design.stitchCount.toLocaleString()),
      detailMetadataRow("Thread steps", design.steps.length.toLocaleString()),
      detailMetadataRow("PES version", String(design.pesVersion)),
      detailMetadataRow("Source size", formatBytes(design.pesBytes)),
      detailMetadataRow("Card space", formatBytes(design.cardStorageBytes ?? design.cardBlobBytes)),
    );
    elements.stepCount.textContent = `${design.steps.length} ${design.steps.length === 1 ? "step" : "steps"}`;
    elements.stepList.replaceChildren(...design.steps.map((step) => {
      const item = document.createElement("article");
      item.className = "step-item";
      const preview = document.createElement("div");
      preview.className = "step-preview";
      if (step.stitchCount > 0) {
        const image = document.createElement("img");
        image.alt = `Stitches for step ${step.number}, ${step.colorName}`;
        image.src = svgObjectUrl(step.previewSvg);
        preview.append(image);
      } else {
        const empty = document.createElement("span");
        empty.className = "step-preview-empty";
        empty.textContent = "No step image stored";
        preview.append(empty);
      }
      const info = document.createElement("div");
      info.className = "step-info";
      const number = document.createElement("span");
      number.className = "step-number";
      number.textContent = `Step ${step.number}`;
      const color = document.createElement("span");
      color.className = "step-color";
      const swatch = document.createElement("span");
      swatch.className = "color-swatch";
      swatch.style.backgroundColor = step.color;
      color.append(swatch, document.createTextNode(step.colorName));
      const code = document.createElement("span");
      code.className = "step-code";
      code.textContent = `Brother ${step.paletteIndex} · ${step.color.toUpperCase()} · ${step.stitchCount.toLocaleString()} stitches`;
      info.append(number, color, code);
      item.append(preview, info);
      return item;
    }));
  } catch (error) {
    elements.stepCount.textContent = "Could not load";
    const message = document.createElement("p");
    message.className = "empty-selection";
    message.textContent = error.message;
    elements.stepList.replaceChildren(message);
  }
}

function toggleDesign(record) {
  if (selected.has(record.id)) selected.delete(record.id);
  else selected.set(record.id, record);
  updateSelection();
  void loadDesigns();
}

function renderDesign(record) {
  const article = document.createElement("article");
  article.className = `design-card${record.supported ? "" : " unsupported"}`;
  article.dataset.id = record.id;
  article.tabIndex = 0;
  article.setAttribute("role", "button");
  article.setAttribute("aria-label", `View details for ${record.label || record.fileName}`);
  const preview = document.createElement("div");
  preview.className = "preview";
  if (record.supported) {
    const image = document.createElement("img");
    image.alt = `Stitch preview for ${record.label || record.fileName}`;
    image.loading = "lazy";
    preview.append(image);
    void attachThumbnail(image, record);
  } else preview.textContent = "No preview";

  const body = document.createElement("div");
  body.className = "design-body";
  const collection = document.createElement("p");
  collection.className = "collection";
  collection.textContent = record.folder || "Library root";
  const title = document.createElement("h2");
  title.textContent = record.label || record.fileName.replace(/\.pes$/i, "");
  title.title = record.fileName;
  const metadata = document.createElement("div");
  metadata.className = "metadata";
  if (record.supported) {
    metadata.append(
      detail("Size", `${record.widthMm.toFixed(1)} × ${record.heightMm.toFixed(1)} mm`),
      detail("Stitches", record.stitchCount.toLocaleString()),
      detail("Colors", record.colorCount.toLocaleString()),
      detail("Card", formatBytes(record.cardStorageBytes), "card-cost"),
    );
  } else {
    const reason = document.createElement("span");
    reason.className = "warning";
    reason.textContent = record.compatibilityReason;
    metadata.append(reason);
  }

  const choose = document.createElement("button");
  choose.className = "choose";
  choose.type = "button";
  choose.disabled = !record.supported;
  choose.textContent = selected.has(record.id) ? "Selected" : "Add to card";
  choose.setAttribute("aria-pressed", String(selected.has(record.id)));
  choose.addEventListener("click", () => toggleDesign(record));
  body.append(collection, title, metadata, choose);
  article.append(preview, body);
  article.classList.toggle("selected", selected.has(record.id));
  article.addEventListener("click", (event) => {
    if (!event.target.closest("button")) void openDesignDetails(record);
  });
  article.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void openDesignDetails(record);
  });
  return article;
}

async function loadDesigns() {
  if (!libraryLoaded) {
    elements.resultCount.textContent = "Choose a library folder to begin";
    elements.grid.replaceChildren();
    return;
  }
  const sequence = ++requestSequence;
  elements.grid.setAttribute("aria-busy", "true");
  const result = await window.ecsLibrary.search({ query: elements.search.value, folderPrefix: elements.folder.value,
    compatibility: elements.compatibility.value, sort: elements.sort.value, limit: 250 });
  if (sequence !== requestSequence) return;
  elements.grid.replaceChildren(...result.designs.map(renderDesign));
  const shown = result.designs.length;
  elements.resultCount.textContent = result.total > shown
    ? `${result.total.toLocaleString()} matches · first ${shown.toLocaleString()} shown`
    : `${result.total.toLocaleString()} ${result.total === 1 ? "design" : "designs"}`;
  elements.grid.setAttribute("aria-busy", "false");
}

function debounce(callback, milliseconds) {
  let timeout;
  return (...arguments_) => { clearTimeout(timeout); timeout = setTimeout(() => callback(...arguments_), milliseconds); };
}

async function applyLibrary(library) {
  libraryLoaded = Boolean(library?.rootPath);
  elements.folder.replaceChildren(new Option("All collections", ""));
  if (!libraryLoaded) {
    elements.libraryCount.textContent = "No folder open";
    elements.libraryPath.textContent = "Choose a folder of PES files.";
    await loadDesigns();
    return;
  }
  elements.libraryCount.textContent = `${library.designCount.toLocaleString()} designs`;
  elements.libraryPath.textContent = `${library.supportedCount.toLocaleString()} compatible · ${library.unsupportedCount.toLocaleString()} need attention`;
  elements.libraryPath.title = library.rootPath;
  for (const folder of library.folders) elements.folder.append(new Option(folder, folder));
  await loadDesigns();
}

async function chooseLibrary() {
  const library = await window.ecsLibrary.chooseFolder();
  if (!library) return;
  selected.clear();
  updateSelection();
  await applyLibrary(library);
}

function hexId(value) { return Number.isInteger(value) ? value.toString(16).padStart(4, "0").toUpperCase() : null; }
function updateWriter({ state, title, detail: writerDetail }) {
  elements.writerIndicator.className = `status-dot${state ? ` ${state}` : ""}`;
  elements.writerStatus.textContent = title;
  elements.writerDetail.textContent = writerDetail;
}

async function readExactly(port, length, timeoutMs = 2500) {
  const reader = port.readable.getReader();
  const chunks = [];
  let received = 0;
  let timeout;
  const timeoutPromise = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("The writer did not respond.")), timeoutMs); });
  try {
    while (received < length) {
      const result = await Promise.race([reader.read(), timeoutPromise]);
      if (result.done) break;
      chunks.push(result.value);
      received += result.value.length;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const response = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { response.set(chunk, offset); offset += chunk.length; }
  if (response.length < length) throw new Error(`Expected ${length} response bytes; received ${response.length}.`);
  return response.slice(0, length);
}

async function queryCard(port) {
  const writer = port.writable.getWriter();
  try { await writer.write(buildCommand(COMMAND.CARD_TYPE)); } finally { writer.releaseLock(); }
  return parseCardStatusResponse(await readExactly(port, 3));
}

class SerialByteReader {
  constructor(reader) {
    this.reader = reader;
    this.pending = new Uint8Array();
  }

  async exactly(length, timeoutMs = 3500) {
    while (this.pending.length < length) {
      let timeout;
      const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("The writer stopped responding during the card read.")), timeoutMs);
      });
      let result;
      try {
        result = await Promise.race([this.reader.read(), timeoutPromise]);
      } finally {
        clearTimeout(timeout);
      }
      if (result.done) throw new Error("The serial connection closed during the card read.");
      const combined = new Uint8Array(this.pending.length + result.value.length);
      combined.set(this.pending);
      combined.set(result.value, this.pending.length);
      this.pending = combined;
    }
    const result = this.pending.slice(0, length);
    this.pending = this.pending.slice(length);
    return result;
  }
}

async function transferCardImage(port, maximumBlocks, onProgress) {
  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const incoming = new SerialByteReader(reader);
  const channel = {
    write: (bytes) => writer.write(bytes),
    readExactly: (length) => incoming.exactly(length),
  };
  try {
    return await readCardStorage(channel, {
      maximumBlocks,
      onProgress: ({ blockCount, bytesRead }) => {
        if (blockCount === 1 || blockCount % 8 === 0) onProgress(blockCount, bytesRead);
      },
    });
  } catch (error) {
    try { await reader.cancel(); } catch {}
    throw error;
  } finally {
    try { reader.releaseLock(); } catch {}
    writer.releaseLock();
  }

}

async function readInsertedCard() {
  if (!serialPort || cardReadInProgress) return;
  cardReadInProgress = true;
  elements.readCard.disabled = true;
  elements.connectWriter.disabled = true;
  elements.readProgress.hidden = false;
  elements.readProgressLabel.textContent = "Starting read-only transfer…";
  elements.readCard.textContent = "Reading card…";
  updateWriter({ state: "connected", title: "Reading inserted card", detail: "No data on the card will be changed." });
  let imageTransferred = false;
  try {
    const maximumBlocks = cardState.capacityBytes
      ? Math.ceil(cardState.capacityBytes / ECS.BLOCK_SIZE)
      : 8192;
    const image = await transferCardImage(serialPort, maximumBlocks, (blocks, bytes) => {
      elements.readProgressLabel.textContent = `${blocks.toLocaleString()} blocks · ${formatBytes(bytes)} read`;
    });
    imageTransferred = true;
    elements.readProgressLabel.textContent = `Validating ${formatBytes(image.length)} image…`;
    const card = await window.ecsCard.inspect(image);
    renderCardContents(card);
    cardState = {
      ...cardState,
      capacityBytes: card.capacityBytes,
      existingBytes: card.occupiedBytes,
    };
    elements.cardKind.textContent = `${cardState.kind === "original" ? "Writable" : "Read-only"} · ${card.designCount} designs`;
    updateWriter({
      state: "connected",
      title: "Card read complete",
      detail: `${formatBytes(card.occupiedBytes)} used · ${formatBytes(card.freeBytes)} free · read-only operation`,
    });
    updateCapacity();
  } catch (error) {
    elements.saveCardBackup.disabled = !imageTransferred;
    elements.cardDesignCount.textContent = "Read failed";
    const message = document.createElement("p");
    message.className = "empty-selection error-text";
    message.textContent = imageTransferred
      ? `${error.message} The exact card backup is still available to save.`
      : error.message;
    elements.cardFileList.replaceChildren(message);
    updateWriter({ state: "error", title: "Could not read card", detail: error.message });
  } finally {
    cardReadInProgress = false;
    elements.readProgress.hidden = true;
    elements.readCard.textContent = "Read inserted card";
    elements.readCard.disabled = !serialPort;
    elements.connectWriter.disabled = false;
  }
}

async function disconnectWriter() {
  if (!serialPort) return;
  await serialPort.close().catch(() => {});
  serialPort = null;
  cardState = { capacityBytes: null, existingBytes: null, writable: false, kind: null };
  elements.readCard.disabled = true;
  elements.connectWriter.textContent = "Connect writer…";
  elements.cardKind.textContent = "No card data";
  updateWriter({ state: "", title: "Writer port not opened", detail: "The cable may be connected. Open the serial port to check the ECS." });
  updateCapacity();
}

async function openWriterPort(port) {
  elements.connectWriter.disabled = true;
  updateWriter({ state: "", title: "Opening writer…", detail: "Configuring the ECS serial connection." });
  try {
    elements.readCard.disabled = true;
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    serialPort = port;
    if (port.setSignals) {
      try {
        await port.setSignals({ requestToSend: true, dataTerminalReady: false });
      } catch (error) {
        await disconnectWriter();
        throw new Error(`Could not configure ECS serial signals: ${error.message}`);
      }
    }
    const info = port.getInfo();
    const deviceId = [hexId(info.usbVendorId), hexId(info.usbProductId)].filter(Boolean).join(":");
    updateWriter({ state: "connected", title: "ECS serial connected", detail: deviceId ? `USB ${deviceId} · 9600 baud` : "Serial port open · 9600 baud" });
    elements.connectWriter.textContent = "Disconnect";
    try {
      const status = await queryCard(port);
      const ambiguousCapacity = status.rawStatus === 0x21;
      cardState = { capacityBytes: ambiguousCapacity ? null : status.capacityBytes, existingBytes: null, writable: status.writable, kind: status.kind };
      cardState.rawStatus = status.rawStatus;
      elements.readCard.disabled = false;
      elements.cardKind.textContent = ambiguousCapacity
        ? "Read-only · capacity unverified"
        : status.kind === "original" ? "Writable card" : status.kind === "read-only" ? "Read-only card" : "Unrecognized card";
      elements.writerDetail.textContent = `${elements.writerDetail.textContent} · status ${status.rawStatus.toString(16).padStart(2, "0").toUpperCase()}`;
    } catch (error) {
      elements.cardKind.textContent = "Card query failed";
      elements.writerDetail.textContent = `Port open; ${error.message}`;
    }
  } catch (error) {
    updateWriter({ state: "error", title: "Connection failed", detail: error.message });
    throw error;
  } finally { elements.connectWriter.disabled = false; updateCapacity(); }
}

async function connectWriter() {
  if (serialPort) { await disconnectWriter(); return; }
  if (!window.ecsSerial || !("serial" in navigator)) {
    updateWriter({ state: "error", title: "Serial unavailable", detail: "This Electron build does not expose Web Serial." });
    return;
  }
  elements.connectWriter.disabled = true;
  updateWriter({ state: "", title: "Selecting device…", detail: "Looking for the Prolific adapter connected to the ECS." });
  try {
    const port = await navigator.serial.requestPort();
    await openWriterPort(port);
  } catch (error) {
    if (error.name === "NotFoundError") {
      updateWriter({ state: "", title: "Writer port not opened", detail: "No serial device was selected." });
    }
  } finally { elements.connectWriter.disabled = false; }
}

async function detectGrantedWriter() {
  if (!("serial" in navigator) || serialPort) return;
  try {
    const ports = await navigator.serial.getPorts();
    const known = ports.find((port) => {
      const info = port.getInfo();
      return info.usbVendorId === 0x067b && info.usbProductId === 0x23a3;
    });
    if (known) await openWriterPort(known);
  } catch (error) {
    updateWriter({ state: "error", title: "Adapter detected", detail: `Could not open the ECS: ${error.message}` });
  }
}

function showPorts(ports) {
  elements.portList.replaceChildren(...ports.map((port) => {
    const ids = [port.vendorId, port.productId].filter(Boolean).join(":");
    const label = port.displayName || port.portName || "Serial device";
    return new Option(ids ? `${label}  [${ids}]` : label, port.portId);
  }));
  if (ports.length > 0) elements.portList.selectedIndex = 0;
  elements.portDialog.showModal();
}

function cancelPortSelection() {
  window.ecsSerial?.selectPort("");
  elements.portDialog.close();
}

elements.search.addEventListener("input", debounce(loadDesigns, 180));
elements.folder.addEventListener("change", loadDesigns);
elements.compatibility.addEventListener("change", loadDesigns);
elements.sort.addEventListener("change", loadDesigns);
elements.chooseFolder.addEventListener("click", chooseLibrary);
elements.openFolder.addEventListener("click", chooseLibrary);
elements.clearSelection.addEventListener("click", () => { selected.clear(); updateSelection(); void loadDesigns(); });
elements.connectWriter.addEventListener("click", connectWriter);
elements.readCard.addEventListener("click", readInsertedCard);
elements.saveCardBackup.addEventListener("click", async () => {
  try {
    const savedPath = await window.ecsCard.saveBackup();
    if (savedPath) updateWriter({ state: serialPort ? "connected" : "", title: "Card backup saved", detail: savedPath });
  } catch (error) {
    updateWriter({ state: "error", title: "Backup failed", detail: error.message });
  }
});
elements.exportAllCard.addEventListener("click", async () => {
  try {
    const result = await window.ecsCard.exportAll();
    if (result) updateWriter({ state: serialPort ? "connected" : "", title: `${result.count} designs exported`, detail: `${result.directory} · raw backup included` });
  } catch (error) {
    updateWriter({ state: "error", title: "Export failed", detail: error.message });
  }
});
elements.portForm.addEventListener("submit", () => { window.ecsSerial.selectPort(elements.portList.value); elements.portDialog.close(); });
elements.cancelPort.addEventListener("click", cancelPortSelection);
elements.cancelPortX.addEventListener("click", cancelPortSelection);
elements.portDialog.addEventListener("cancel", (event) => { event.preventDefault(); cancelPortSelection(); });
elements.closeDetails.addEventListener("click", () => elements.designDialog.close());
elements.designDialog.addEventListener("close", clearDetailUrls);
elements.designDialog.addEventListener("click", (event) => {
  const bounds = elements.designDialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) elements.designDialog.close();
});

updateSelection();
renderCardContents(null);
window.ecsSerial?.onPorts(showPorts);
navigator.serial?.addEventListener("disconnect", (event) => { if (event.target === serialPort) void disconnectWriter(); });
void detectGrantedWriter();

if (!window.ecsLibrary) {
  elements.libraryCount.textContent = "Desktop shell required";
  elements.libraryPath.textContent = "Launch this screen through the desktop application.";
} else await applyLibrary(await window.ecsLibrary.getState());
