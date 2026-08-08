import type { Scene } from "../model/types";

export const AUTOSAVE_KEY = "wobblewerk:autosave";

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene);
}

export function deserializeScene(json: string): Scene {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("unsupported file"); }
  const s = parsed as Scene;
  if (!s || s.version !== 1 || !Array.isArray(s.strokes)) throw new Error("unsupported file");
  return s;
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
