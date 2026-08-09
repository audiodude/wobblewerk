export interface Palette { id: string; label: string; paper: string; inks: string[] }

export const PALETTES: Palette[] = [
  { id: "notebook", label: "Notebook", paper: "#faf8f2",
    inks: ["#2a9d8f", "#f4743b", "#8338ec", "#d81159", "#9ac026"] },
  { id: "ballpoint", label: "Ballpoint", paper: "#faf8f2", inks: ["#3a3aa8"] },
  { id: "blackwork", label: "Blackwork", paper: "#f7f5ef", inks: ["#1a1a1a"] },
  { id: "bauhaus", label: "Bauhaus", paper: "#f2e9d8",
    inks: ["#d62828", "#1d1d1b", "#e9a820", "#1d3557"] },
  { id: "constructivist", label: "Constructivist", paper: "#f2e6d0",
    inks: ["#d33f2e", "#211d1a", "#8a7f72"] },
  { id: "neon", label: "Neon on black", paper: "#1b1b1e",
    inks: ["#2de1fc", "#ff3d9e", "#b8f533", "#ffb52e"] },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function resolveInk(palette: Palette, colorSlot: number): string {
  const i = ((colorSlot - 1) % palette.inks.length + palette.inks.length) % palette.inks.length;
  return palette.inks[i]!;
}
