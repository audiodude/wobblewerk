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
  setGrain,
  setHand,
  setPalette,
} from "./engine/scene";
import { History } from "./engine/history";
import { autosave, deserializeScene, flushAutosave, loadAutosave, serializeScene } from "./engine/persist";
import { SheetRenderer } from "./render/svg";
import { ViewBox } from "./render/viewport";
import { getPalette, PALETTES } from "./model/palettes";
import { exportSvgString } from "./export/svg";
import { artworkClip, download, exportPngBlob, timestampName } from "./export/png";
import { BRUSHES } from "./brushes/index";
import { defaultParams } from "./model/types";
import type { Scene } from "./model/types";
import type { XY } from "./model/geometry";
import { sheetDims, type SheetOrientation, type SheetSize } from "./model/sheets";

declare global {
  interface Window {
    __ww: { getScene: () => Scene; exportSvgString: () => string };
  }
}

// ---- DOM refs ----

const svgEl = document.querySelector<SVGSVGElement>("#sheet")!;
const stageEl = document.getElementById("stage")!;
const newDialog = document.getElementById("new-dialog") as HTMLDialogElement;
const paletteStripEl = document.getElementById("palette-strip") as HTMLElement;
const paletteSelect = document.getElementById("palette-select") as HTMLSelectElement;
const handDialInput = document.querySelector<HTMLInputElement>("#hand-dial input")!;
const grainDialInput = document.querySelector<HTMLInputElement>("#grain-dial input")!;
const vintageBannerEl = document.getElementById("vintage-banner") as HTMLElement;
const vintageCountEl = document.getElementById("vintage-count") as HTMLElement;
const btnRegenVintage = document.getElementById("btn-regen-vintage") as HTMLButtonElement;
const toolButtons = document.querySelectorAll<HTMLButtonElement>("#tools button[data-tool]");
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnRedo = document.getElementById("btn-redo") as HTMLButtonElement;
const btnFit = document.getElementById("btn-fit") as HTMLButtonElement;
const btnNew = document.getElementById("btn-new") as HTMLButtonElement;
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;
const btnOpen = document.getElementById("btn-open") as HTMLButtonElement;
const btnExportSvg = document.getElementById("btn-export-svg") as HTMLButtonElement;
const btnExportPng = document.getElementById("btn-export-png") as HTMLButtonElement;
const fileOpenInput = document.getElementById("file-open") as HTMLInputElement;
const panelEl = document.getElementById("param-panel") as HTMLElement;

// ---- boot ----

const loaded = loadAutosave();
let scene: Scene = loaded ?? newScene(sheetDims("s", "square").w, sheetDims("s", "square").h);
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

// Shared by undo/redo: both just move within the existing snapshot stack (no
// history.push — that would be a new branch, not a navigation). Sheet
// dimensions can differ across a crossed New/Open boundary (both are now
// undoable document boundaries — see New-sheet and openFile below), so the
// ViewBox only gets rebuilt + re-fit when the sheet size actually changed;
// otherwise the existing vb (and the user's current pan/zoom) is preserved.
function applySceneFromHistory(next: Scene): void {
  const prevSheet = scene.sheet;
  scene = next;
  seedIdCounter(scene);
  const sheetChanged = scene.sheet.w !== prevSheet.w || scene.sheet.h !== prevSheet.h;
  if (sheetChanged) vb = new ViewBox(scene.sheet.w, scene.sheet.h);
  renderer.renderScene(scene);
  if (sheetChanged) doFit();
  else applyViewBox();
  syncPaletteSelect();
  syncSelectionAfterSceneReplace();
  autosave(scene);
  refreshChrome();
}

function doUndo(): void {
  const next = history.undo();
  if (next) applySceneFromHistory(next);
}

function doRedo(): void {
  const next = history.redo();
  if (next) applySceneFromHistory(next);
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

function onGrainInput(v: number): void {
  setGrain(scene, v);
  renderer.updateGrain(scene); // grain touches no strokes — no full re-render
}

function onGrainCommit(): void {
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
  grainDial: grainDialInput,
  banner: vintageBannerEl,
  bannerCount: vintageCountEl,
  bannerRegen: btnRegenVintage,
  getScene: () => scene,
  state: appState,
  onSwatchClick,
  onPaletteChange,
  onHandInput,
  onHandCommit,
  onGrainInput,
  onGrainCommit,
  onRegenVintage,
};
installChrome(chromeDeps);
refreshChrome(); // initial paint: swatch strip, hand dial position, banner hidden, undo/redo disabled

// ---- new-sheet dialog ----

btnNew.addEventListener("click", () => newDialog.showModal());

let newSheetSize: SheetSize = "s";
const sizeButtons = newDialog.querySelectorAll<HTMLButtonElement>("button[data-size]");
const orientationButtons = newDialog.querySelectorAll<HTMLButtonElement>("button[data-sheet]");

function updateNewDialogLabels(): void {
  sizeButtons.forEach((b) => {
    b.dataset.active = String(b.dataset.size === newSheetSize);
  });
  orientationButtons.forEach((b) => {
    const { w, h } = sheetDims(newSheetSize, b.dataset.sheet as SheetOrientation);
    b.querySelector("small")!.textContent = `${w} × ${h}`;
  });
}

sizeButtons.forEach((b) =>
  b.addEventListener("click", () => {
    newSheetSize = b.dataset.size as SheetSize;
    updateNewDialogLabels();
  }),
);
updateNewDialogLabels();

orientationButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = sheetDims(newSheetSize, btn.dataset.sheet as SheetOrientation);
    scene = newScene(preset.w, preset.h);
    seedIdCounter(scene);
    vb = new ViewBox(scene.sheet.w, scene.sheet.h);
    // New Sheet is an undoable document boundary, not a hard reset — Ctrl+Z
    // brings back the drawing that was open before New was clicked.
    history.push(scene);
    autosave(scene);
    renderer.renderScene(scene);
    doFit();
    syncPaletteSelect();
    syncSelectionAfterSceneReplace();
    refreshChrome();
    newDialog.close();
  });
});

// ---- save / open / export ----

btnSave.addEventListener("click", () => {
  download(timestampName("wobblewerk", "json"), new Blob([serializeScene(scene)], { type: "application/json" }));
});

btnOpen.addEventListener("click", () => fileOpenInput.click());

// Opened files render from their stored bake verbatim: renderer.renderScene()
// only ever reads stroke.baked (see render/svg.ts's inkAttrs), never calls
// setHand/bakeStroke/migrate, so this path can't accidentally re-bake.
async function openFile(file: File): Promise<void> {
  // Atomic: everything that can throw (parse/validate, ViewBox construction —
  // a structurally-malformed-but-version-1 file can still have a garbage
  // sheet) happens here, into locals, before any real state is touched. Any
  // throw falls through to the catch below; `scene`/`vb` are never reassigned
  // on failure, so the current document is provably untouched.
  //
  // Everything after this try (history.push/autosave/renderScene/...) is left
  // unguarded on purpose — deserializeScene now validates deeply enough
  // (brush input coords, baked path entries) that those calls shouldn't be
  // able to throw on a file that passed validation. The `.catch` on this
  // function's call site below is the backstop for that assumption, not the
  // primary defense: it only prevents a silent unhandled rejection, it can't
  // undo already-committed scene/history/autosave state.
  let opened: Scene;
  let newVb: ViewBox;
  try {
    opened = deserializeScene(await file.text());
    newVb = new ViewBox(opened.sheet.w, opened.sheet.h);
  } catch {
    alert("Not a wobblewerk file");
    return; // current scene untouched
  }
  scene = opened;
  seedIdCounter(scene);
  vb = newVb;
  // Open is an undoable document boundary, not a hard reset — Ctrl+Z brings
  // back the drawing that was open before Open was clicked.
  history.push(scene);
  autosave(scene);
  renderer.renderScene(scene);
  doFit();
  syncPaletteSelect();
  // Opened files are a foreign document: their stroke ids (s1, s2, ...) can
  // collide with the previous document's, so syncSelectionAfterSceneReplace's
  // "same id = same stroke" check isn't safe here — a pre-open selection
  // could silently attach its halo/panel to an unrelated stroke. Always
  // deselect instead; deselect() itself no-ops if nothing was selected.
  deselect();
  refreshChrome();
}

fileOpenInput.addEventListener("change", () => {
  const file = fileOpenInput.files?.[0];
  fileOpenInput.value = ""; // reset so re-opening the same file re-fires 'change'
  // Backstop, not the primary defense (see openFile's comment): guarantees no
  // silent unhandled rejection even if some future gap lets a throw past
  // deserializeScene's validation and into the post-assignment continuation.
  if (file) openFile(file).catch(() => alert("Not a wobblewerk file"));
});

btnExportSvg.addEventListener("click", () => {
  download(timestampName("wobblewerk", "svg"), new Blob([exportSvgString(svgEl, scene)], { type: "image/svg+xml" }));
});

const pngDialog = document.getElementById("png-dialog") as HTMLDialogElement;

function doPngExport(clip?: ReturnType<typeof artworkClip>): void {
  pngDialog.close();
  exportPngBlob(svgEl, scene, clip ?? undefined)
    .then((blob) => download(timestampName("wobblewerk", "png"), blob))
    .catch(() => alert("PNG export failed"));
}

btnExportPng.addEventListener("click", () => pngDialog.showModal());
document.getElementById("png-clip-yes")!.addEventListener("click", () => doPngExport(artworkClip(scene)));
document.getElementById("png-clip-no")!.addEventListener("click", () => doPngExport());
document.getElementById("png-clip-cancel")!.addEventListener("click", () => pngDialog.close());

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
  // Auto-select the stroke you just finished — the panel binds to it immediately
  // (tweak params right away) while the drawing tool stays active. Esc to get
  // back to the tool-defaults panel.
  onStrokeCommitted: select,
});

// ---- selection: click-to-select + keyboard ----

svgEl.addEventListener("click", (e) => {
  if (appState.tool !== "select") return;
  const target = e.target as Element | null;
  const hitEl = target?.closest?.("[data-stroke-id]") ?? null;
  if (hitEl) select(hitEl.getAttribute("data-stroke-id")!);
  else deselect();
});

const TOOL_KEYS: Record<string, Tool> = { "1": "zigzag", "2": "squarecluster", "3": "sunstamp", v: "select" };

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
