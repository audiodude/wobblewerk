import { AppState, type Tool } from "./ui/app-state";
import { installChrome, refreshChrome as refreshChromeUI, type ChromeDeps } from "./ui/chrome";
import { installDrawing } from "./ui/draw";
import { deleteSelected, flushPendingEdit, renderPanel, rerollSelected, type PanelDeps } from "./ui/panel";
import {
  getStroke,
  newScene,
  regenerateAllVintage,
  reslotStroke,
  seedIdCounter,
  setHand,
  setPalette,
} from "./engine/scene";
import { History } from "./engine/history";
import { autosave, flushAutosave, loadAutosave } from "./engine/persist";
import { SheetRenderer } from "./render/svg";
import { ViewBox } from "./render/viewport";
import { getPalette, PALETTES } from "./model/palettes";
import { exportSvgString } from "./export/svg";
import { BRUSHES } from "./brushes/index";
import { defaultParams } from "./model/types";
import type { Scene } from "./model/types";
import type { XY } from "./model/geometry";

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
const paletteStripEl = document.getElementById("palette-strip") as HTMLElement;
const paletteSelect = document.getElementById("palette-select") as HTMLSelectElement;
const handDialInput = document.querySelector<HTMLInputElement>("#hand-dial input")!;
const vintageBannerEl = document.getElementById("vintage-banner") as HTMLElement;
const vintageCountEl = document.getElementById("vintage-count") as HTMLElement;
const btnRegenVintage = document.getElementById("btn-regen-vintage") as HTMLButtonElement;
const toolButtons = document.querySelectorAll<HTMLButtonElement>("#tools button[data-tool]");
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnRedo = document.getElementById("btn-redo") as HTMLButtonElement;
const btnFit = document.getElementById("btn-fit") as HTMLButtonElement;
const btnNew = document.getElementById("btn-new") as HTMLButtonElement;
const panelEl = document.getElementById("param-panel") as HTMLElement;

// ---- boot ----

const loaded = loadAutosave();
let scene: Scene = loaded ?? newScene(SHEET_PRESETS.square!.w, SHEET_PRESETS.square!.h);
seedIdCounter(scene);

const renderer = new SheetRenderer(svgEl);
let vb = new ViewBox(scene.sheet.w, scene.sheet.h);
const history = new History();
const appState = new AppState();

// Per-brush param values, owned here so Task 18's panel can bind to the same map.
export const brushParams: Record<string, Record<string, number>> = Object.fromEntries(
  Object.values(BRUSHES).map((b) => [b.id, defaultParams(b)]),
);
function getParams(brushId: string): Record<string, number> {
  return brushParams[brushId] ?? {};
}

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
  btnUndo.disabled = !history.canUndo;
  btnRedo.disabled = !history.canRedo;
  refreshChromeUI(chromeDeps);
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
  syncPaletteSelect();
  syncSelectionAfterSceneReplace();
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
  syncPaletteSelect();
  syncSelectionAfterSceneReplace();
  autosave(scene);
  refreshChrome();
}

btnUndo.addEventListener("click", doUndo);
btnRedo.addEventListener("click", doRedo);
btnFit.addEventListener("click", doFit);

window.addEventListener("resize", doFit);

// ---- selection & param panel infra ----
// (the interactions that *drive* selection — svg click, keyboard — are wired
// further down, near the drawing section; these are the shared primitives.)

function liveUpdate(): void {
  if (!appState.selection) return;
  renderer.updateStroke(scene, appState.selection);
  renderer.setSelection(scene, appState.selection);
}

const panelDeps: PanelDeps = {
  container: panelEl,
  getScene: () => scene,
  state: appState,
  renderer,
  commit,
  liveUpdate,
};

function refreshPanel(): void {
  renderPanel(panelDeps, brushParams);
}

function select(id: string): void {
  appState.selection = id;
  renderer.setSelection(scene, id);
  refreshPanel();
}

function deselect(): void {
  if (appState.selection === null) return;
  flushPendingEdit(panelDeps); // commit a live-but-uncommitted slider edit before tearing the panel down
  appState.selection = null;
  renderer.setSelection(scene, null);
  refreshPanel();
}

// renderScene() (undo/redo/new-sheet) rebuilds the whole SVG, wiping g.overlay
// — re-apply the halo if the selected stroke survived, else drop the selection.
function syncSelectionAfterSceneReplace(): void {
  if (appState.selection && !getStroke(scene, appState.selection)) {
    appState.selection = null;
  }
  renderer.setSelection(scene, appState.selection);
  refreshPanel();
}

// ---- tools ----

function setActiveTool(tool: Tool): void {
  appState.tool = tool;
  toolButtons.forEach((b) => {
    b.dataset.active = String(b.dataset.tool === tool);
  });
  svgEl.classList.toggle("tool-select", tool === "select");
  renderer.clearLive(); // keyboard switches (1/2/3/v) don't get draw.ts's reactive mousemove-driven clear
  // Product ruling: leaving select always deselects — tool switch is a fresh start, not a lingering
  // edit context. deselect() no-ops if nothing's selected, so this is cheap on the common path.
  if (tool !== "select") deselect();
  refreshPanel();
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

// ---- chrome: palette strip, hand dial, vintage banner ----
// src/ui/chrome.ts owns the DOM for these three widgets (swatch buttons, dial
// listeners, banner visibility); this section only supplies the callbacks
// that decide what a click/drag/change *means* for the scene — same split as
// panelDeps/PanelDeps above.

function onPaletteChange(id: string): void {
  setPalette(scene, id);
  // A pin means "this specific ink slot" — if the new palette doesn't have
  // that many inks, the slot no longer refers to anything. Reset to auto
  // rather than clamping into some other color the user didn't choose;
  // refreshChrome() (via commit(), below) repaints the strip with the auto
  // chip active and no ring, so the UI stays truthful to the actual state.
  if (appState.pinnedSlot !== null && appState.pinnedSlot > getPalette(id).inks.length) {
    appState.pinnedSlot = null;
  }
  renderer.renderScene(scene);
  applyViewBox();
  syncSelectionAfterSceneReplace();
  commit();
}

// Swatch click: re-slot the current selection if one exists; else toggle the
// pin (clicking the already-pinned swatch again unpins it — back to auto-
// rotate). The auto chip itself is chrome.ts's own concern (just sets
// pinnedSlot = null unconditionally, no selection branch).
export function onSwatchClick(slot: number): void {
  if (appState.selection) {
    reslotStroke(scene, appState.selection, slot);
    liveUpdate();
    commit();
    return;
  }
  appState.pinnedSlot = appState.pinnedSlot === slot ? null : slot;
  refreshChrome();
}

function onHandInput(v: number): void {
  setHand(scene, v);
  renderer.renderScene(scene);
  applyViewBox();
  renderer.setSelection(scene, appState.selection); // renderScene() wipes g.overlay — same fix as syncSelectionAfterSceneReplace
}

function onHandCommit(): void {
  commit();
}

function onRegenVintage(): void {
  regenerateAllVintage(scene);
  renderer.renderScene(scene);
  applyViewBox();
  renderer.setSelection(scene, appState.selection);
  commit(); // vintageCount() is now 0 — refreshChrome() (via commit) hides the banner
}

const chromeDeps: ChromeDeps = {
  paletteStrip: paletteStripEl,
  paletteSelect,
  handDial: handDialInput,
  banner: vintageBannerEl,
  bannerCount: vintageCountEl,
  bannerRegen: btnRegenVintage,
  getScene: () => scene,
  state: appState,
  onSwatchClick,
  onPaletteChange,
  onHandInput,
  onHandCommit,
  onRegenVintage,
};
installChrome(chromeDeps);
refreshChrome(); // initial paint: swatch strip, hand dial position, banner hidden, undo/redo disabled

// ---- new-sheet dialog ----

btnNew.addEventListener("click", () => newDialog.showModal());

newDialog.querySelectorAll<HTMLButtonElement>("button[data-sheet]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = SHEET_PRESETS[btn.dataset.sheet!]!;
    scene = newScene(preset.w, preset.h);
    seedIdCounter(scene);
    vb = new ViewBox(scene.sheet.w, scene.sheet.h);
    history.reset(scene);
    autosave(scene);
    renderer.renderScene(scene);
    doFit();
    syncPaletteSelect();
    syncSelectionAfterSceneReplace();
    refreshChrome();
    newDialog.close();
  });
});

// ---- zoom & pan on #stage ----

function clientToSheet(e: { clientX: number; clientY: number }): XY {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: vb.x + ((e.clientX - rect.left) / rect.width) * vb.w,
    y: vb.y + ((e.clientY - rect.top) / rect.height) * vb.h,
  };
}

stageEl.addEventListener(
  "wheel",
  (e: WheelEvent) => {
    e.preventDefault();
    const { x: sheetX, y: sheetY } = clientToSheet(e);
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

// ---- drawing ----

installDrawing({
  svg: svgEl,
  getScene: () => scene,
  state: appState,
  renderer,
  clientToSheet,
  getParams,
  // spaceDown (not `panning`) — pointerdown fires before the stageEl "mousedown"
  // handler that flips `panning` true, so gating on `panning` would race and let
  // a space+drag start a brush stroke on the very first frame. spaceDown is set
  // by keydown, strictly earlier than any click in the same pan gesture.
  isPanning: () => spaceDown,
  commit,
});

// ---- selection: click-to-select + keyboard ----

svgEl.addEventListener("click", (e) => {
  if (appState.tool !== "select") return;
  const target = e.target as Element | null;
  const hitEl = target?.closest?.("[data-stroke-id]") ?? null;
  if (hitEl) select(hitEl.getAttribute("data-stroke-id")!);
  else deselect();
});

const TOOL_KEYS: Record<string, Tool> = { "1": "zigzag", "2": "hexpack", "3": "sunstamp", v: "select" };

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    deselect();
    return;
  }
  if (isFormControl(document.activeElement)) return; // let inputs/selects/buttons/textareas handle their own keys

  if (e.ctrlKey && e.key === "0") {
    e.preventDefault();
    doFit();
    return;
  }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    doRedo();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    doUndo();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return; // don't hijack other chords for the bare-key shortcuts below

  const tool = TOOL_KEYS[e.key.toLowerCase()];
  if (tool) {
    setActiveTool(tool);
    return;
  }
  if (e.key.toLowerCase() === "r") {
    rerollSelected(panelDeps, brushParams);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    deleteSelected(panelDeps, brushParams);
  }
});

// ---- misc ----

window.addEventListener("beforeunload", () => flushAutosave());

// ---- debug hook (e2e suite + later tasks depend on this) ----

window.__ww = {
  getScene: () => scene,
  exportSvgString: () => exportSvgString(svgEl, scene),
};
