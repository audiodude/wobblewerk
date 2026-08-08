export type Rng = () => number;

export function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: number): Rng {
  const r = sfc32(seed >>> 0, (seed ^ 0x9e3779b9) >>> 0, (seed ^ 0x85ebca6b) >>> 0, (seed ^ 0xc2b2ae35) >>> 0);
  for (let i = 0; i < 12; i++) r(); // warm up
  return r;
}

export function strokeStreams(seed: number): { gen: Rng; hand: Rng } {
  return { gen: rngFromSeed(seed), hand: rngFromSeed((seed ^ 0x6a09e667) >>> 0) };
}

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  }
  return Math.floor(Math.random() * 0x100000000);
}
