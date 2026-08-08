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

test("deserialize rejects malformed baked entries and brush inputs (coordinator review round 2)", () => {
  const base = { version: 1, sheet: { w: 100, h: 100 }, paletteId: "notebook", hand: 0.5 };
  const mkStroke = (overrides: Record<string, unknown>) => ({
    id: "s1", brush: "zigzag", brushVersion: 1, seed: 1, params: {}, colorSlot: 1,
    input: { kind: "path", points: [{ x: 0, y: 0 }] },
    baked: [{ d: "M0 0", stroke: true, fill: false, width: 2 }],
    ...overrides,
  });

  // a `null` baked entry — this exact shape used to pass validation, reach
  // renderScene's inkAttrs (`b.d` on null), and throw outside the try/catch.
  expect(() =>
    deserializeScene(JSON.stringify({ ...base, strokes: [mkStroke({ baked: [null] })] })),
  ).toThrow("unsupported file");

  // a baked entry missing `d`
  expect(() =>
    deserializeScene(
      JSON.stringify({ ...base, strokes: [mkStroke({ baked: [{ stroke: true, fill: false, width: 2 }] })] }),
    ),
  ).toThrow("unsupported file");

  // a baked entry with a non-finite width
  expect(() =>
    deserializeScene(
      JSON.stringify({
        ...base,
        strokes: [mkStroke({ baked: [{ d: "M0 0", stroke: true, fill: false, width: "thick" }] })],
      }),
    ),
  ).toThrow("unsupported file");

  // a point input without `at`
  expect(() =>
    deserializeScene(JSON.stringify({ ...base, strokes: [mkStroke({ input: { kind: "point" } })] })),
  ).toThrow("unsupported file");

  // a point input with non-numeric coords
  expect(() =>
    deserializeScene(
      JSON.stringify({ ...base, strokes: [mkStroke({ input: { kind: "point", at: { x: "0", y: 0 } } })] }),
    ),
  ).toThrow("unsupported file");

  // a path input whose points aren't an array
  expect(() =>
    deserializeScene(JSON.stringify({ ...base, strokes: [mkStroke({ input: { kind: "path", points: "nope" } })] })),
  ).toThrow("unsupported file");

  // a path input with a malformed point in the array
  expect(() =>
    deserializeScene(
      JSON.stringify({ ...base, strokes: [mkStroke({ input: { kind: "path", points: [{ x: 0, y: 0 }, {}] } })] }),
    ),
  ).toThrow("unsupported file");

  // a fully valid file (point, path, and region inputs) still round-trips
  const validJson = JSON.stringify({
    ...base,
    strokes: [
      mkStroke({ id: "s1", input: { kind: "point", at: { x: 1, y: 2 } } }),
      mkStroke({ id: "s2", input: { kind: "path", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] } }),
      mkStroke({ id: "s3", input: { kind: "region", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 0 }] } }),
    ],
  });
  expect(() => deserializeScene(validJson)).not.toThrow();
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

test("autosave swallows a QuotaExceededError from setItem instead of dying uncaught (finding 3)", () => {
  const scene = mkScene();
  const setItem = vi.fn(() => {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  autosave(scene, { setItem });
  expect(() => vi.advanceTimersByTime(300)).not.toThrow();
  expect(setItem).toHaveBeenCalledOnce();
  warn.mockRestore();
});

test("flushAutosave also swallows a QuotaExceededError", () => {
  const scene = mkScene();
  const setItem = vi.fn(() => {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  autosave(scene, { setItem });
  expect(() => flushAutosave()).not.toThrow();
  expect(setItem).toHaveBeenCalledOnce();
  warn.mockRestore();
});

test("autosave and loadAutosave without storage argument in headless environment", () => {
  const scene = mkScene();
  expect(() => autosave(scene)).not.toThrow();
  expect(() => loadAutosave()).not.toThrow();
  expect(loadAutosave()).toBeNull();
});
