import type { Scene } from "../model/types";

export const AUTOSAVE_KEY = "wobblewerk:autosave";

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene);
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidXY(p: unknown): boolean {
  if (typeof p !== "object" || p === null) return false;
  const xy = p as Record<string, unknown>;
  return isFiniteNumber(xy.x) && isFiniteNumber(xy.y);
}

// point needs a real `at`; path/region need a `points` array of real XYs —
// a malformed one (missing/non-numeric coords) would otherwise only surface
// later, as a throw from a dial-move rebake or a re-roll, not at open time.
function isValidBrushInput(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const i = input as Record<string, unknown>;
  if (i.kind === "point") return isValidXY(i.at);
  if (i.kind === "path" || i.kind === "region") return Array.isArray(i.points) && i.points.every(isValidXY);
  return false;
}

// A baked path entry as rendered by render/svg.ts's inkAttrs (`d`/`width`
// read directly off it, `stroke`/`fill` gate ink attrs) — checked so a
// malformed entry (e.g. `null`) can't throw inside renderScene, which runs
// outside deserializeScene's own try/catch at every call site.
function isValidBakedPath(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const b = entry as Record<string, unknown>;
  return typeof b.d === "string" && typeof b.stroke === "boolean" && typeof b.fill === "boolean" && isFiniteNumber(b.width);
}

// Validated deeply enough that downstream code (ViewBox construction,
// renderScene's inkAttrs, palette lookups) can't throw on a structurally-
// broken-but-version-1 file — every stroke's brush input and baked path
// entries are checked, not just their containers' shapes.
function isValidStroke(stroke: unknown): boolean {
  if (typeof stroke !== "object" || stroke === null) return false;
  const s = stroke as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.brush === "string" &&
    isFiniteNumber(s.brushVersion) &&
    isFiniteNumber(s.seed) &&
    isFiniteNumber(s.colorSlot) &&
    typeof s.params === "object" && s.params !== null &&
    Array.isArray(s.baked) && s.baked.every(isValidBakedPath) &&
    isValidBrushInput(s.input)
  );
}

function isValidScene(value: unknown): value is Scene {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (s.version !== 1) return false;
  const sheet = s.sheet as Record<string, unknown> | undefined;
  if (typeof sheet !== "object" || sheet === null) return false;
  if (!isFiniteNumber(sheet.w) || sheet.w <= 0) return false;
  if (!isFiniteNumber(sheet.h) || sheet.h <= 0) return false;
  if (typeof s.paletteId !== "string") return false;
  if (!isFiniteNumber(s.hand)) return false;
  if (!Array.isArray(s.strokes)) return false;
  return s.strokes.every(isValidStroke);
}

export function deserializeScene(json: string): Scene {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("unsupported file"); }
  if (!isValidScene(parsed)) throw new Error("unsupported file");
  return parsed;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: (() => void) | undefined;

function defaultStorage(): Storage | undefined {
  return typeof localStorage !== "undefined" ? localStorage : undefined;
}

export function autosave(scene: Scene, storage: Pick<Storage, "setItem"> | undefined = undefined): void {
  const store = storage ?? defaultStorage();
  if (!store) return;
  clearTimeout(timer);
  pending = () => {
    try {
      store.setItem(AUTOSAVE_KEY, serializeScene(scene));
    } catch (err) {
      // e.g. QuotaExceededError — autosave is best-effort; don't let a full
      // storage quota crash the timer callback and kill future autosaves.
      console.warn("wobblewerk: autosave failed", err);
    }
  };
  timer = setTimeout(() => { pending?.(); pending = undefined; }, 300);
}

export function flushAutosave(): void {
  clearTimeout(timer);
  pending?.();
  pending = undefined;
}

export function loadAutosave(storage: Pick<Storage, "getItem"> | undefined = undefined): Scene | null {
  const store = storage ?? defaultStorage();
  if (!store) return null;
  const raw = store.getItem(AUTOSAVE_KEY);
  if (!raw) return null;
  try { return deserializeScene(raw); } catch { return null; }
}
