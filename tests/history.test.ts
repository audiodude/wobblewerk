import { expect, test } from "vitest";
import { History } from "../src/engine/history";
import { newScene } from "../src/engine/scene";

test("undo/redo walk snapshots", () => {
  const h = new History();
  const scene = newScene(100, 100);
  h.reset(scene);
  expect(h.canUndo).toBe(false);
  scene.hand = 0.1; h.push(scene);
  scene.hand = 0.2; h.push(scene);
  expect(h.undo()!.hand).toBe(0.1);
  expect(h.undo()!.hand).toBe(0.6); // newScene default
  expect(h.undo()).toBeNull();
  expect(h.redo()!.hand).toBe(0.1);
  expect(h.redo()!.hand).toBe(0.2);
  expect(h.redo()).toBeNull();
});

test("push after undo truncates redo tail", () => {
  const h = new History();
  const scene = newScene(100, 100);
  h.reset(scene);
  scene.hand = 0.1; h.push(scene);
  h.undo();
  scene.hand = 0.9; h.push(scene);
  expect(h.canRedo).toBe(false);
  expect(h.undo()!.hand).toBe(0.6);
});

test("cap drops oldest", () => {
  const h = new History(3);
  const scene = newScene(100, 100);
  h.reset(scene);
  for (let i = 1; i <= 5; i++) { scene.hand = i / 10; h.push(scene); }
  let last = null, steps = 0;
  for (let s = h.undo(); s; s = h.undo()) { last = s; steps++; }
  expect(steps).toBe(2); // cap 3 = current + 2 older
  expect(last!.hand).toBe(0.3);
});

test("snapshots are deep copies", () => {
  const h = new History();
  const scene = newScene(100, 100);
  h.reset(scene);
  scene.hand = 0.5; h.push(scene);
  const restored = h.undo()!;
  restored.hand = 0.99;
  expect(h.redo()!.hand).toBe(0.5);
});
