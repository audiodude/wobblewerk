import { AppState, type Tool } from "./ui/app-state";
import { newScene, seedIdCounter, setPalette } from "./engine/scene";
import { History } from "./engine/history";
import { autosave, flushAutosave, loadAutosave } from "./engine/persist";
import { SheetRenderer } from "./render/svg";
import { ViewBox } from "./render/viewport";
import { PALETTES } from "./model/palettes";
import { exportSvgString } from "./export/svg";
import type { Scene } from "./model/types";

declare global {
  interface Window {
    __ww: { getScene: () => Scene; exportSvgString: () => string };
  }
}

const SHEET_PRESETS: Record<string, { w: number; h: number }> = {
  square: { w: 1600, h: 1600 },
  portrait: { w: 1600, h: 2000 },
  landscape: { w: 2000, h: 1600 },
};

// ---- DOM refs ----

const svgEl = document.querySelector<SVGSVGElement>("#sheet")!;
const stageEl = document.getElementById("stage")!;
const newDialog = document.getElementById("new-dialog") as HTMLDialogElement;
const paletteSelect = document.getElementById("palette-select") as HTMLSelectElement;
const toolButtons = document.querySelectorAll<HTMLButtonElement>("#tools button[data-tool]");
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnRedo = document.getElementById("btn-redo") as HTMLButtonElement;
const btnFit = document.getElementById("btn-fit") as HTMLButtonElement;
const btnNew = document.getElementById("btn-new") as HTMLButtonElement;

// ---- boot ----

const loaded = loadAutosave();
let scene: Scene = loaded ?? newScene(SHEET_PRESETS.square!.w, SHEET_PRESETS.square!.h);
seedIdCounter(scene);

const renderer = new SheetRenderer(svgEl);
let vb = new ViewBox(scene.sheet.w, scene.sheet.h);
const history = new History();
const appState = new AppState();

function applyViewBox(): void {
  svgEl.setAttribute("viewBox", vb.toString());
}

function doFit(): void {
  vb.fit(stageEl.clientWidth, stageEl.clientHeight);
  applyViewBox();
}

renderer.renderScene(scene);
doFit();
history.reset(scene);

if (!loaded) newDialog.showModal();

// ---- history / commit (later tasks call this after any mutation) ----

function refreshChrome(): void {
  // Task 19 fills in: undo/redo disabled state, vintage banner visibility
}

function commit(): void {
  history.push(scene);
  autosave(scene);
  refreshChrome();
}

function doUndo(): void {
  const next = history.undo();
  if (!next) return;
  scene = next;
  seedIdCounter(scene);
  renderer.renderScene(scene);
  applyViewBox();
  autosave(scene);
  refreshChrome();
}

function doRedo(): void {
  const next = history.redo();
  if (!next) return;
  scene = next;
  seedIdCounter(scene);
  renderer.renderScene(scene);
  applyViewBox();
  autosave(scene);
  refreshChrome();
}

btnUndo.addEventListener("click", doUndo);
btnRedo.addEventListener("click", doRedo);
btnFit.addEventListener("click", doFit);

window.addEventListener("resize", doFit);
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "0") {
    e.preventDefault();
    doFit();
  }
});

// ---- tools ----

function setActiveTool(tool: Tool): void {
  appState.tool = tool;
  toolButtons.forEach((b) => {
    b.dataset.active = String(b.dataset.tool === tool);
  });
  svgEl.classList.toggle("tool-select", tool === "select");
}
toolButtons.forEach((b) => b.addEventListener("click", () => setActiveTool(b.dataset.tool as Tool)));
setActiveTool(appState.tool);

// ---- palette ----

function syncPaletteSelect(): void {
  paletteSelect.value = scene.paletteId;
}

for (const p of PALETTES) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.label;
  paletteSelect.appendChild(opt);
}
syncPaletteSelect();

paletteSelect.addEventListener("change", () => {
  setPalette(scene, paletteSelect.value);
  renderer.renderScene(scene);
  applyViewBox();
  commit();
});

// ---- new-sheet dialog ----

btnNew.addEventListener("click", () => newDialog.showModal());

newDialog.querySelectorAll<HTMLButtonElement>("button[data-sheet]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = SHEET_PRESETS[btn.dataset.sheet!]!;
    scene = newScene(preset.w, preset.h);
    vb = new ViewBox(scene.sheet.w, scene.sheet.h);
    history.reset(scene);
    autosave(scene);
    renderer.renderScene(scene);
    doFit();
    syncPaletteSelect();
    refreshChrome();
    newDialog.close();
  });
});

// ---- zoom & pan on #stage ----

stageEl.addEventListener(
  "wheel",
  (e: WheelEvent) => {
    e.preventDefault();
    const rect = svgEl.getBoundingClientRect();
    const sheetX = vb.x + ((e.clientX - rect.left) / rect.width) * vb.w;
    const sheetY = vb.y + ((e.clientY - rect.top) / rect.height) * vb.h;
    const factor = e.deltaY < 0 ? 1 / 1.1 : 1.1;
    vb.zoomAt(sheetX, sheetY, factor);
    applyViewBox();
  },
  { passive: false },
);

let spaceDown = false;
let panning = false;
let lastClientX = 0;
let lastClientY = 0;

function isFormControl(el: Element | null): boolean {
  if (!el) return false;
  return ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(el.tagName);
}

window.addEventListener("keydown", (e) => {
  // Guard against hijacking Space on a focused button/input (native Space = click/type there).
  if (e.code === "Space" && !spaceDown && !isFormControl(document.activeElement)) {
    e.preventDefault(); // avoid page scroll while panning
    spaceDown = true;
    stageEl.classList.add("panning-ready");
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceDown = false;
    panning = false;
    stageEl.classList.remove("panning-ready", "panning");
  }
});
stageEl.addEventListener("mousedown", (e) => {
  if (!spaceDown) return;
  panning = true;
  lastClientX = e.clientX;
  lastClientY = e.clientY;
  stageEl.classList.add("panning");
});
window.addEventListener("mousemove", (e) => {
  if (!panning) return;
  const rect = svgEl.getBoundingClientRect();
  const dxSheet = ((e.clientX - lastClientX) / rect.width) * vb.w;
  const dySheet = ((e.clientY - lastClientY) / rect.height) * vb.h;
  vb.panBy(-dxSheet, -dySheet);
  applyViewBox();
  lastClientX = e.clientX;
  lastClientY = e.clientY;
});
window.addEventListener("mouseup", () => {
  panning = false;
  stageEl.classList.remove("panning");
});

// ---- misc ----

window.addEventListener("beforeunload", () => flushAutosave());

// ---- debug hook (e2e suite + later tasks depend on this) ----

window.__ww = {
  getScene: () => scene,
  exportSvgString: () => exportSvgString(svgEl, scene),
};
