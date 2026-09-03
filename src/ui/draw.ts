import type { XY } from "../model/geometry";
import type { BakedPath, BrushInput, Scene, Stroke } from "../model/types";
import { getBrush } from "../brushes/index";
import { runPipeline } from "../engine/generate";
import { addStroke } from "../engine/scene";
import { getPalette } from "../model/palettes";
import { randomSeed } from "../model/rng";
import type { SheetRenderer } from "../render/svg";
import type { AppState, Tool } from "./app-state";

export interface DrawDeps {
  svg: SVGSVGElement;
  getScene(): Scene;
  state: AppState;
  renderer: SheetRenderer;
  clientToSheet(e: PointerEvent): XY;
  getParams(brushId: string): Record<string, number>;
  isPanning(): boolean;
  commit(): void;
  /** Called with the new stroke's id right after it lands in the scene — lets the
   * app auto-select it (param panel binds to it) without switching tools. */
  onStrokeCommitted(id: string): void;
}

type DragTool = "zigzag" | "squarecluster";

function isBrushTool(tool: Tool): tool is DragTool | "sunstamp" {
  return tool === "zigzag" || tool === "squarecluster" || tool === "sunstamp";
}

/**
 * Wires pointer interactions on `deps.svg` to draw with the currently active brush
 * tool: zigzag (path, live full-pipeline preview), squarecluster (region, dashed
 * ghost preview, packs on release), sunstamp (point, hover preview + click-to-stamp).
 * Self-contained state machine — no module-level globals outside this closure.
 */
export function installDrawing(deps: DrawDeps): void {
  const { svg, getScene, state, renderer, clientToSheet, getParams, isPanning, commit, onStrokeCommitted } = deps;

  // ---- drag state, used by the zigzag/squarecluster pointerdown->move->up cycle ----
  let dragging = false;
  let dragTool: DragTool | null = null;
  let activePointerId = -1;
  let spine: XY[] = [];
  let dragSeed = 0;
  let dragColorSlot = 1;
  let rafId: number | null = null;

  // ---- sunstamp hover-preview state ----
  let previewSeed = randomSeed();
  let lastTool: Tool = state.tool;

  function bakedFor(brushId: string, input: BrushInput, seed: number, params: Record<string, number>): BakedPath[] {
    const scene = getScene();
    return runPipeline(getBrush(brushId), input, params, seed, scene.hand);
  }

  function transientStroke(
    brushId: string,
    input: BrushInput,
    seed: number,
    params: Record<string, number>,
    colorSlot: number,
  ): Stroke {
    return {
      id: "__live__",
      brush: brushId,
      brushVersion: getBrush(brushId).version,
      input,
      seed,
      params,
      colorSlot,
      baked: bakedFor(brushId, input, seed, params),
    };
  }

  // Detects state.tool changes since the last time we looked (there's no change
  // event on AppState). Called at the top of every hover/pointerdown so a tool
  // switch always clears stale live ink and, when landing on sunstamp, rolls a
  // fresh preview seed ("chosen at tool activation").
  function checkToolActivation(): void {
    const tool = state.tool;
    if (tool === lastTool) return;
    lastTool = tool;
    renderer.clearLive();
    if (tool === "sunstamp") previewSeed = randomSeed();
  }

  function scheduleLiveRender(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      renderDragLive();
    });
  }

  function cancelScheduledRender(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function renderDragLive(): void {
    if (!dragging || !dragTool) return;
    if (dragTool === "squarecluster") {
      renderer.renderGhost(spine);
      return;
    }
    const scene = getScene();
    const params = { ...getParams("zigzag") };
    const stroke = transientStroke("zigzag", { kind: "path", points: spine }, dragSeed, params, dragColorSlot);
    renderer.renderLive(scene, stroke); // full pipeline, includes hand pass — nothing jumps on release
  }

  function finishDrag(shouldCommit: boolean): void {
    cancelScheduledRender();
    dragging = false;
    const tool = dragTool;
    const finalSpine = spine;
    dragTool = null;
    spine = [];
    renderer.clearLive();
    if (!shouldCommit || !tool) return; // pointercancel: discard entirely

    const scene = getScene();
    const params = { ...getParams(tool) };
    const input: BrushInput =
      tool === "squarecluster" ? { kind: "region", points: finalSpine } : { kind: "path", points: finalSpine };
    if (bakedFor(tool, input, dragSeed, params).length === 0) return; // degenerate: nothing generated, don't commit

    const stroke = addStroke(scene, { brush: tool, input, seed: dragSeed, params, colorSlot: dragColorSlot });
    renderer.updateStroke(scene, stroke.id);
    commit();
    onStrokeCommitted(stroke.id);
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || dragging || isPanning()) return;
    checkToolActivation(); // safe here: only reached on a genuine new interaction, never mid-drag
    const tool = state.tool;
    if (!isBrushTool(tool)) return; // "select" tool: not ours to handle

    const pt = clientToSheet(e);
    const scene = getScene();
    // WYSIWYG: ink drawn off-sheet is clipped out of exports, so a stroke
    // that *starts* on the matte would be invisible on screen too (or, for
    // sunstamp, commit an invisible stroke outright). Ignore it — a drag
    // that starts on the sheet and wanders off stays allowed; only its
    // off-sheet portion clips.
    if (pt.x < 0 || pt.y < 0 || pt.x > scene.sheet.w || pt.y > scene.sheet.h) return;

    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    const inkCount = getPalette(scene.paletteId).inks.length;

    if (tool === "sunstamp") {
      const seed = previewSeed;
      const params = { ...getParams("sunstamp") };
      const input: BrushInput = { kind: "point", at: pt };
      const colorSlot = state.nextColorSlot(inkCount);
      const stroke = addStroke(scene, { brush: "sunstamp", input, seed, params, colorSlot });
      renderer.clearLive();
      renderer.updateStroke(scene, stroke.id);
      commit();
      onStrokeCommitted(stroke.id);
      previewSeed = randomSeed(); // fresh seed for the next hover preview
      return;
    }

    dragging = true;
    dragTool = tool;
    activePointerId = e.pointerId;
    spine = [pt];
    dragSeed = randomSeed();
    dragColorSlot = state.nextColorSlot(inkCount);
  }

  function onPointerMove(e: PointerEvent): void {
    if (dragging) {
      if (e.pointerId !== activePointerId) return;
      spine.push(clientToSheet(e));
      scheduleLiveRender();
      return;
    }
    if (isPanning()) return;
    checkToolActivation();
    if (state.tool !== "sunstamp" || e.buttons !== 0) return; // hover preview only, no button held
    const scene = getScene();
    const params = { ...getParams("sunstamp") };
    // Preview color: exact when pinned; a static approximation (slot 1) when
    // auto-rotating, since peeking the real next slot would require mutating
    // AppState's rotation counter on every hover frame (nextColorSlot() has that
    // side effect) and corrupt the cycling order of strokes actually committed.
    const colorSlot = state.pinnedSlot ?? 1;
    const stroke = transientStroke("sunstamp", { kind: "point", at: clientToSheet(e) }, previewSeed, params, colorSlot);
    renderer.renderLive(scene, stroke);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging || e.pointerId !== activePointerId) return;
    finishDrag(true);
  }

  function onPointerCancel(e: PointerEvent): void {
    if (!dragging || e.pointerId !== activePointerId) return;
    finishDrag(false);
  }

  function onPointerLeave(): void {
    if (dragging) return; // pointer capture keeps the drag alive even off-element
    renderer.clearLive();
  }

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerCancel);
  svg.addEventListener("pointerleave", onPointerLeave);
}
