const elements = {
  search: document.querySelector("#search"),
  folder: document.querySelector("#folder"),
  compatibility: document.querySelector("#compatibility"),
  sort: document.querySelector("#sort"),
  grid: document.querySelector("#design-grid"),
  resultCount: document.querySelector("#result-count"),
  libraryCount: document.querySelector("#library-count"),
  libraryPath: document.querySelector("#library-path"),
  chooseFolder: document.querySelector("#choose-folder"),
  selectionCount: document.querySelector("#selection-count"),
  selectionSize: document.querySelector("#selection-size"),
  clearSelection: document.querySelector("#clear-selection"),
};

const selected = new Map();
let requestSequence = 0;
let libraryLoaded = false;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes.toLocaleString()} bytes`;
  return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`;
}

function updateSelection() {
  const records = [...selected.values()];
  const totalBytes = records.reduce((sum, record) => sum + (record.cardBlobBytes ?? 0), 0);
  elements.selectionCount.textContent = `${records.length.toLocaleString()} ${records.length === 1 ? "design" : "designs"}`;
  elements.selectionSize.textContent = `${formatBytes(totalBytes)} of design data`;
  elements.clearSelection.disabled = records.length === 0;
}

function detail(label, value) {
  const item = document.createElement("span");
  item.textContent = `${label} ${value}`;
  return item;
}

async function attachThumbnail(image, record) {
  const svg = await window.ecsLibrary.thumbnail(record.id);
  if (!svg || !image.isConnected) return;
  image.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

function renderDesign(record) {
  const article = document.createElement("article");
  article.className = `design-card${record.supported ? "" : " unsupported"}`;
  article.dataset.id = record.id;

  const preview = document.createElement("div");
  preview.className = "preview";
  if (record.supported) {
    const image = document.createElement("img");
    image.alt = `Stitch preview for ${record.label || record.fileName}`;
    image.loading = "lazy";
    preview.append(image);
    void attachThumbnail(image, record);
  } else {
    preview.textContent = "Preview unavailable";
  }

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
      detail("Card", formatBytes(record.cardBlobBytes)),
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
  choose.addEventListener("click", () => {
    if (selected.has(record.id)) selected.delete(record.id);
    else selected.set(record.id, record);
    choose.textContent = selected.has(record.id) ? "Selected" : "Add to card";
    choose.setAttribute("aria-pressed", String(selected.has(record.id)));
    article.classList.toggle("selected", selected.has(record.id));
    updateSelection();
  });

  body.append(collection, title, metadata, choose);
  article.append(preview, body);
  article.classList.toggle("selected", selected.has(record.id));
  return article;
}

async function loadDesigns() {
  if (!libraryLoaded) {
    elements.resultCount.textContent = "Choose a folder containing PES designs to begin.";
    elements.grid.replaceChildren();
    return;
  }
  const sequence = ++requestSequence;
  elements.grid.setAttribute("aria-busy", "true");
  const result = await window.ecsLibrary.search({
    query: elements.search.value,
    folderPrefix: elements.folder.value,
    compatibility: elements.compatibility.value,
    sort: elements.sort.value,
    limit: 250,
  });
  if (sequence !== requestSequence) return;
  elements.grid.replaceChildren(...result.designs.map(renderDesign));
  const shown = result.designs.length;
  elements.resultCount.textContent = result.total > shown
    ? `${result.total.toLocaleString()} matches · showing first ${shown.toLocaleString()}`
    : `${result.total.toLocaleString()} ${result.total === 1 ? "design" : "designs"}`;
  elements.grid.setAttribute("aria-busy", "false");
}

function debounce(callback, milliseconds) {
  let timeout;
  return (...arguments_) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...arguments_), milliseconds);
  };
}

async function applyLibrary(library) {
  libraryLoaded = Boolean(library?.rootPath);
  elements.folder.replaceChildren(new Option("All collections", ""));
  if (!libraryLoaded) {
    elements.libraryCount.textContent = "Choose a design folder";
    elements.libraryPath.textContent = "No files are accessed until you choose one.";
    await loadDesigns();
    return;
  }
  elements.libraryCount.textContent = `${library.designCount.toLocaleString()} designs indexed`;
  elements.libraryPath.textContent = `${library.supportedCount.toLocaleString()} ready · ${library.unsupportedCount.toLocaleString()} need attention`;
  elements.chooseFolder.title = library.rootPath;
  for (const folder of library.folders) elements.folder.append(new Option(folder, folder));
  await loadDesigns();
}

elements.search.addEventListener("input", debounce(loadDesigns, 180));
elements.folder.addEventListener("change", loadDesigns);
elements.compatibility.addEventListener("change", loadDesigns);
elements.sort.addEventListener("change", loadDesigns);
elements.chooseFolder.addEventListener("click", async () => {
  const library = await window.ecsLibrary.chooseFolder();
  if (!library) return;
  selected.clear();
  updateSelection();
  await applyLibrary(library);
});
elements.clearSelection.addEventListener("click", () => {
  selected.clear();
  updateSelection();
  loadDesigns();
});

updateSelection();
if (!window.ecsLibrary) {
  elements.libraryCount.textContent = "Desktop shell required";
  elements.libraryPath.textContent = "Launch this interface through the ECS Card Writer application.";
} else {
  await applyLibrary(await window.ecsLibrary.getState());
}
