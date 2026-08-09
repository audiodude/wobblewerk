import { expect, test } from "vitest";
import { SHEET_BASES, sheetDims } from "../src/model/sheets";

test("all nine size x orientation combinations match the spec table", () => {
  expect(sheetDims("s", "square")).toEqual({ w: 800, h: 800 });
  expect(sheetDims("s", "portrait")).toEqual({ w: 800, h: 1000 });
  expect(sheetDims("s", "landscape")).toEqual({ w: 1000, h: 800 });
  expect(sheetDims("m", "square")).toEqual({ w: 1200, h: 1200 });
  expect(sheetDims("m", "portrait")).toEqual({ w: 1200, h: 1500 });
  expect(sheetDims("m", "landscape")).toEqual({ w: 1500, h: 1200 });
  expect(sheetDims("l", "square")).toEqual({ w: 1600, h: 1600 });
  expect(sheetDims("l", "portrait")).toEqual({ w: 1600, h: 2000 });
  expect(sheetDims("l", "landscape")).toEqual({ w: 2000, h: 1600 });
});

test("L sizes equal the legacy presets exactly", () => {
  // v1 hard-coded square 1600x1600, portrait 1600x2000, landscape 2000x1600
  expect(SHEET_BASES.l).toBe(1600);
});
