import { BRUSHES, getBrush } from "../brushes/index";
import { deleteStroke, getStroke, isVintage, migrateStroke, reparamStroke, rerollStroke } from "../engine/scene";
import type { ParamDef, Scene, Stroke } from "../model/types";
import type { SheetRenderer } from "../render/svg";
import type { AppState, Tool } from "./app-state";

export interface PanelDeps {
  container: HTMLElement; // #param-panel
  getScene(): Scene;
  state: AppState;
  renderer: SheetRenderer;
  commit(): void;
  liveUpdate(): void; // re-render selected stroke without history push
}

/** Tools that map 1:1 onto a brush id; "select" has no brush of its own. */
function toolBrushId(tool: Tool): string | null {
  return tool === "select" ? null : tool;
}

function slider(
  def: ParamDef,
  value: number,
  scopeKey: string,
  disabled: boolean,
  onInput: (v: number) => void,
  onChange: () => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "panel-slider-row";

  const id = `param-${scopeKey}-${def.key}`;
  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.textContent = def.label;

  const input = document.createElement("input");
  input.type = "range";
  input.id = id;
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String((def.max - def.min) / 100 || 0.01);
  input.value = String(value);
  input.disabled = disabled;
  input.addEventListener("input", () => onInput(Number(input.value)));
  input.addEventListener("change", onChange);

  row.append(label, input);
  return row;
}

function renderToolPanel(deps: PanelDeps, brushParams: Record<string, Record<string, number>>): void {
  const brushId = toolBrushId(deps.state.tool);
  if (!brushId) {
    const p = document.createElement("p");
    p.className = "panel-hint";
    p.textContent = "Select a stroke to edit its params.";
    deps.container.appendChild(p);
    return;
  }

  const brush = getBrush(brushId);
  const title = document.createElement("h3");
  title.textContent = brush.id;
  deps.container.appendChild(title);

  const params = brushParams[brushId] ?? {};
  for (const def of brush.params) {
    const value = params[def.key] ?? def.default;
    // Future strokes only: no live re-render, no history entry — just mutate
    // the shared params map that draw.ts's getParams(brushId) reads from.
    deps.container.appendChild(slider(def, value, brushId, false, (v) => (params[def.key] = v), () => {}));
  }
}

function renderSelectionPanel(
  deps: PanelDeps,
  brushParams: Record<string, Record<string, number>>,
  stroke: Stroke,
): void {
  const vintage = isVintage(stroke);

  const title = document.createElement("h3");
  title.textContent = stroke.brush;
  deps.container.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "panel-actions";

  if (vintage) {
    const note = document.createElement("p");
    note.className = "panel-note";
    note.textContent = `vintage (brush v${stroke.brushVersion}) — regenerate to edit`;
    deps.container.appendChild(note);

    const regenBtn = document.createElement("button");
    regenBtn.type = "button";
    regenBtn.textContent = "Regenerate";
    regenBtn.addEventListener("click", () => {
      migrateStroke(deps.getScene(), stroke.id);
      deps.liveUpdate();
      deps.commit();
      renderPanel(deps, brushParams); // re-render: now current-version, sliders enabled
    });
    actions.appendChild(regenBtn);
  } else {
    const rerollBtn = document.createElement("button");
    rerollBtn.type = "button";
    rerollBtn.textContent = "re-roll";
    rerollBtn.addEventListener("click", () => rerollSelected(deps, brushParams));
    actions.appendChild(rerollBtn);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "delete";
  deleteBtn.addEventListener("click", () => deleteSelected(deps, brushParams));
  actions.appendChild(deleteBtn);

  deps.container.appendChild(actions);

  // Param defs come from the *current* brush registration (labels/min/max);
  // values come from the stroke. If the brush id itself is gone entirely
  // (not just version-bumped), there's nothing to render sliders against.
  const paramDefs = BRUSHES[stroke.brush]?.params ?? [];
  for (const def of paramDefs) {
    const value = stroke.params[def.key] ?? def.default;
    deps.container.appendChild(
      slider(
        def,
        value,
        stroke.id,
        vintage,
        (v) => {
          reparamStroke(deps.getScene(), stroke.id, { ...stroke.params, [def.key]: v });
          deps.liveUpdate();
        },
        () => deps.commit(),
      ),
    );
  }
}

export function renderPanel(deps: PanelDeps, brushParams: Record<string, Record<string, number>>): void {
  deps.container.replaceChildren();

  const selId = deps.state.selection;
  const stroke = selId ? getStroke(deps.getScene(), selId) : undefined;

  if (selId && !stroke) {
    // Stale selection (shouldn't happen — callers keep state.selection in
    // sync with the live scene). Defensive: fall back to the no-selection panel.
    deps.state.selection = null;
    renderPanel(deps, brushParams);
    return;
  }

  if (stroke) renderSelectionPanel(deps, brushParams, stroke);
  else renderToolPanel(deps, brushParams);
}

/** Re-roll the selected stroke (no-op if nothing selected or it's vintage — vintage uses Regenerate instead). */
export function rerollSelected(deps: PanelDeps, brushParams: Record<string, Record<string, number>>): void {
  const id = deps.state.selection;
  if (!id) return;
  const stroke = getStroke(deps.getScene(), id);
  if (!stroke || isVintage(stroke)) return;
  rerollStroke(deps.getScene(), id);
  deps.liveUpdate();
  deps.commit();
  renderPanel(deps, brushParams);
}

/** Delete the selected stroke and deselect (no-op if nothing selected). */
export function deleteSelected(deps: PanelDeps, brushParams: Record<string, Record<string, number>>): void {
  const id = deps.state.selection;
  if (!id) return;
  deleteStroke(deps.getScene(), id);
  deps.renderer.removeStroke(id);
  deps.state.selection = null;
  deps.renderer.setSelection(deps.getScene(), null);
  deps.commit();
  renderPanel(deps, brushParams);
}
