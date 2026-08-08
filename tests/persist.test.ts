import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AUTOSAVE_KEY, autosave, deserializeScene, flushAutosave, loadAutosave, serializeScene } from "../src/engine/persist";
import { addStroke, newScene } from "../src/engine/scene";
import { defaultParams } from "../src/model/types";
import { zigzag } from "../src/brushes/zigzag";

const mkScene = () => {
  const scene = newScene(1600, 2000);
  addStroke(scene, {
    brush: "zigzag",
    input: { kind: "path", points: Array.from({ length: 120 }, (_, i) => ({ x: i * 4, y: 300 + Math.sin(i / 9) * 40 })) },
    seed: 5, params: defaultParams(zigzag), colorSlot: 2,
  });
  return scene;
};

test("round-trip preserves everything including bake, byte-exact", () => {
  const scene = mkScene();
  const restored = deserializeScene(serializeScene(scene));
  expect(restored).toEqual(scene);
  expect(serializeScene(restored)).toBe(serializeScene(scene)); // bake fidelity
});

test("deserialize rejects garbage and wrong versions", () => {
  expect(() => deserializeScene("{}")).toThrow("unsupported file");
  expect(() => deserializeScene('{"version":2,"strokes":[]}')).toThrow("unsupported file");
});

test("deserialize rejects structurally-malformed version-1 files", () => {
  // version 1 but no sheet at all — used to pass the old shallow check and
  // blow up later (e.g. `new ViewBox(scene.sheet.w, ...)`) instead of here.
  expect(() => deserializeScene('{"version":1,"strokes":[]}')).toThrow("unsupported file");

  // sheet present but dims aren't numeric
  expect(() =>
    deserializeScene(
      JSON.stringify({ version: 1, sheet: { w: "wide", h: 100 }, paletteId: "notebook", hand: 0.5, strokes: [] }),
    ),
  ).toThrow("unsupported file");

  // non-positive sheet dims
  expect(() =>
    deserializeScene(
      JSON.stringify({ version: 1, sheet: { w: 0, h: 100 }, paletteId: "notebook", hand: 0.5, strokes: [] }),
    ),
  ).toThrow("unsupported file");

  // a stroke that isn't even an object
  expect(() =>
    deserializeScene(
      JSON.stringify({ version: 1, sheet: { w: 100, h: 100 }, paletteId: "notebook", hand: 0.5, strokes: [null] }),
    ),
  ).toThrow("unsupported file");

  // missing paletteId / hand
  expect(() =>
    deserializeScene(JSON.stringify({ version: 1, sheet: { w: 100, h: 100 }, strokes: [] })),
  ).toThrow("unsupported file");

  // a valid, minimal version-1 scene still passes
  expect(() =>
    deserializeScene(
      JSON.stringify({ version: 1, sheet: { w: 100, h: 100 }, paletteId: "notebook", hand: 0.5, strokes: [] }),
    ),
  ).not.toThrow();
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("autosave debounces 300ms", () => {
  const store = new Map<string, string>();
  const storage = { setItem: (k: string, v: string) => void store.set(k, v) };
  const scene = mkScene();
  autosave(scene, storage);
  autosave(scene, storage);
  expect(store.size).toBe(0);
  vi.advanceTimersByTime(299);
  expect(store.size).toBe(0);
  vi.advanceTimersByTime(2);
  expect(store.get(AUTOSAVE_KEY)).toBe(serializeScene(scene));
});

test("loadAutosave returns scene or null", () => {
  const scene = mkScene();
  const good = { getItem: () => serializeScene(scene) };
  const bad = { getItem: () => "not json" };
  const empty = { getItem: () => null };
  expect(loadAutosave(good)).toEqual(scene);
  expect(loadAutosave(bad)).toBeNull();
  expect(loadAutosave(empty)).toBeNull();
});

test("flushAutosave fires pending immediately and prevents double-write", () => {
  const store = new Map<string, string>();
  const storage = {
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
  };
  const scene = mkScene();
  autosave(scene, storage);
  expect(storage.setItem).not.toHaveBeenCalled();
  flushAutosave();
  expect(storage.setItem).toHaveBeenCalledOnce();
  expect(store.get(AUTOSAVE_KEY)).toBe(serializeScene(scene));
  vi.advanceTimersByTime(300);
  expect(storage.setItem).toHaveBeenCalledOnce(); // not called again
});

test("autosave and loadAutosave without storage argument in headless environment", () => {
  const scene = mkScene();
  expect(() => autosave(scene)).not.toThrow();
  expect(() => loadAutosave()).not.toThrow();
  expect(loadAutosave()).toBeNull();
});
