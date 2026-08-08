import type { Scene } from "../model/types";

export const AUTOSAVE_KEY = "wobblewerk:autosave";

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene);
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidBrushInput(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const kind = (input as { kind?: unknown }).kind;
  return kind === "point" || kind === "path" || kind === "region";
}

// Minimally shaped, not exhaustively validated (e.g. baked entries' own fields
// aren't checked) — enough to guarantee downstream code (ViewBox construction,
// renderScene, palette lookups) can't throw on a structurally-broken-but-
// version-1 file.
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
    Array.isArray(s.baked) &&
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
  pending = () => store.setItem(AUTOSAVE_KEY, serializeScene(scene));
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
