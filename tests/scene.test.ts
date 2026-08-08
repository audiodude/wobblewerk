import { describe, expect, test } from "vitest";
import { addStroke, deleteStroke, isVintage, newScene, regenerateAllVintage, reparamStroke, rerollStroke, reslotStroke, setHand, setPalette, vintageCount } from "../src/engine/scene";
import { zigzag } from "../src/brushes/zigzag";
import { defaultParams } from "../src/model/types";
import type { BrushInput, Scene, Stroke } from "../src/model/types";

const input: BrushInput = {
  kind: "path",
  points: Array.from({ length: 150 }, (_, i) => ({ x: 100 + i * 3, y: 400 + Math.sin(i / 10) * 50 })),
};
const mk = (): { scene: Scene; s: Stroke } => {
  const scene = newScene(1600, 2000);
  const s = addStroke(scene, { brush: "zigzag", input, seed: 42, params: defaultParams(zigzag), colorSlot: 1 });
  return { scene, s };
};

describe("scene", () => {
  test("addStroke bakes and appends", () => {
    const { scene, s } = mk();
    expect(scene.strokes).toHaveLength(1);
    expect(s.baked.length).toBeGreaterThan(0);
    expect(s.brushVersion).toBe(zigzag.version);
    expect(isVintage(s)).toBe(false);
  });
  test("deleteStroke removes by id", () => {
    const { scene, s } = mk();
    deleteStroke(scene, s.id);
    expect(scene.strokes).toHaveLength(0);
  });
  test("reroll changes seed and geometry, keeps input/params", () => {
    const { scene, s } = mk();
    const before = s.baked[0]!.d, seed = s.seed;
    rerollStroke(scene, s.id);
    expect(s.seed).not.toBe(seed);
    expect(s.baked[0]!.d).not.toBe(before);
    expect(s.input).toBe(input);
  });
  test("reparam rebakes; reslot does not rebake", () => {
    const { scene, s } = mk();
    const before = s.baked[0]!.d;
    reparamStroke(scene, s.id, { ...s.params, runLength: 60 });
    expect(s.baked[0]!.d).not.toBe(before);
    const after = s.baked[0]!.d;
    reslotStroke(scene, s.id, 3);
    expect(s.colorSlot).toBe(3);
    expect(s.baked[0]!.d).toBe(after);
  });
  test("setHand rebakes non-vintage, skips vintage; regenerateAllVintage migrates", () => {
    const { scene, s } = mk();
    const s2 = addStroke(scene, { brush: "zigzag", input, seed: 7, params: defaultParams(zigzag), colorSlot: 2 });
    s.brushVersion = 999; // simulate vintage
    const frozen = s.baked[0]!.d, live = s2.baked[0]!.d;
    expect(vintageCount(scene)).toBe(1);
    setHand(scene, 0.1);
    expect(s.baked[0]!.d).toBe(frozen);      // vintage untouched
    expect(s2.baked[0]!.d).not.toBe(live);   // live rebaked
    regenerateAllVintage(scene);
    expect(vintageCount(scene)).toBe(0);
    expect(s.brushVersion).toBe(zigzag.version);
    expect(s.baked[0]!.d).not.toBe(frozen);
  });
  test("setPalette never touches bake", () => {
    const { scene, s } = mk();
    s.brushVersion = 999;
    const frozen = s.baked[0]!.d;
    setPalette(scene, "bauhaus");
    expect(scene.paletteId).toBe("bauhaus");
    expect(s.baked[0]!.d).toBe(frozen);
  });
  test("missing brush stays vintage; mutations don't throw or rebake", () => {
    const { scene, s } = mk();
    s.brush = "ghost"; // simulate deleted brush
    expect(isVintage(s)).toBe(true);
    const frozenBake = s.baked[0]!.d, frozenSeed = s.seed;

    // Add a real-brush stroke that should migrate
    const s2 = addStroke(scene, { brush: "zigzag", input, seed: 99, params: defaultParams(zigzag), colorSlot: 2 });
    s2.brushVersion = 999; // make it vintage
    const s2VersionBefore = s2.brushVersion;

    // regenerateAllVintage must not throw and must not rebake the ghost stroke, but MUST migrate s2
    regenerateAllVintage(scene);
    expect(s.baked[0]!.d).toBe(frozenBake);
    expect(s.seed).toBe(frozenSeed);
    expect(isVintage(s)).toBe(true);
    expect(s2.brushVersion).not.toBe(s2VersionBefore); // real stroke migrated (version updated)

    // rerollStroke should not throw or burn seed for missing brush
    rerollStroke(scene, s.id);
    expect(s.seed).toBe(frozenSeed);
    expect(s.baked[0]!.d).toBe(frozenBake);

    // reparamStroke should not throw for missing brush
    expect(() => reparamStroke(scene, s.id, { ...s.params })).not.toThrow();
    expect(s.baked[0]!.d).toBe(frozenBake);
  });
});
