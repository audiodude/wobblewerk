import { vintageCount } from "../engine/scene";
import { getPalette } from "../model/palettes";
import type { Scene } from "../model/types";
import type { AppState } from "./app-state";

export interface ChromeDeps {
  paletteStrip: HTMLElement; // #palette-strip
  paletteSelect: HTMLSelectElement; // #palette-select
  handDial: HTMLInputElement; // #hand-dial input
  banner: HTMLElement; // #vintage-banner
  bannerCount: HTMLElement; // #vintage-count
  bannerRegen: HTMLButtonElement; // #btn-regen-vintage
  getScene(): Scene;
  state: AppState;
  onSwatchClick(slot: number): void; // pin/unpin or re-slot selection (main.ts decides)
  onPaletteChange(id: string): void;
  onHandInput(v: number): void; // live: setHand + full re-render (no push)
  onHandCommit(): void; // change event: commit()
  onRegenVintage(): void;
}

/**
 * Wires the topbar/rail/stage chrome that isn't the drawing surface itself:
 * palette strip (change event), hand dial (input/change), vintage banner
 * (regenerate button). Mirrors installDrawing's shape — event wiring only,
 * no initial paint; call refreshChrome(deps) once after this to paint the
 * boot state (same split main.ts already uses for panelDeps/renderPanel).
 */
export function installChrome(deps: ChromeDeps): void {
  deps.paletteSelect.addEventListener("change", () => deps.onPaletteChange(deps.paletteSelect.value));

  deps.handDial.addEventListener("input", () => {
    deps.onHandInput(Number(deps.handDial.value));
    // setHand() never changes which strokes are vintage (it skips them), so the
    // count is stable across a single drag — just show/refresh it live, in step
    // with the dial, rather than only on release.
    const n = vintageCount(deps.getScene());
    if (n > 0) {
      deps.bannerCount.textContent = `${n} vintage stroke(s) unaffected`;
      deps.banner.hidden = false;
    }
  });
  deps.handDial.addEventListener("change", () => deps.onHandCommit());

  deps.bannerRegen.addEventListener("click", () => deps.onRegenVintage());
}

/**
 * Rebuilds/re-syncs everything chrome.ts owns to match the current scene +
 * app state: palette strip (swatch count follows the current palette's ink
 * count), pin/auto indicator, hand dial position, and vintage banner
 * visibility. Called from main's commit() and after any scene swap
 * (undo/redo/open/new/palette change) — cheap enough (a handful of DOM
 * nodes) to just rebuild rather than diff.
 */
export function refreshChrome(deps: ChromeDeps): void {
  rebuildPaletteStrip(deps);

  // Keep the dial's displayed position honest across scene swaps it didn't
  // cause itself (undo/redo past a hand-drag commit, opening a file, New
  // Sheet) — mirrors main.ts's existing syncPaletteSelect() for the same
  // class of bug. Never runs mid-drag: this only fires from commit()/scene-
  // swap paths, never from the dial's own 'input' handler.
  deps.handDial.value = String(deps.getScene().hand);

  // Only ever hides here — showing it live is the dial-input handler's job
  // (installChrome), scoped to the moment the user actually moves the dial.
  if (vintageCount(deps.getScene()) === 0) deps.banner.hidden = true;
}

function rebuildPaletteStrip(deps: ChromeDeps): void {
  const scene = deps.getScene();
  const palette = getPalette(scene.paletteId);
  const pinned = deps.state.pinnedSlot;

  // #palette-strip also hosts #palette-select, a permanent sibling built by
  // main.ts — only the swatch buttons this function owns get torn down.
  deps.paletteStrip.querySelectorAll(".swatch").forEach((el) => el.remove());

  palette.inks.forEach((color, i) => {
    const slot = i + 1;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.title = `Ink ${slot}`;
    btn.dataset.slot = String(slot);
    btn.style.background = color;
    if (pinned === slot) btn.dataset.pinned = "true";
    btn.addEventListener("click", () => deps.onSwatchClick(slot));
    deps.paletteStrip.appendChild(btn);
  });

  const autoChip = document.createElement("button");
  autoChip.type = "button";
  autoChip.className = "swatch swatch-auto";
  autoChip.title = "Auto-rotate ink";
  autoChip.textContent = "auto";
  autoChip.dataset.active = String(pinned === null);
  autoChip.addEventListener("click", () => {
    deps.state.pinnedSlot = null;
    refreshChrome(deps);
  });
  deps.paletteStrip.appendChild(autoChip);
}
