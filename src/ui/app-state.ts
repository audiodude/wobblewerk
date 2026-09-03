export type Tool = "zigzag" | "squarecluster" | "sunstamp" | "select";
export class AppState {
  tool: Tool = "zigzag";
  pinnedSlot: number | null = null;   // null = auto-rotate
  selection: string | null = null;
  private rotation = 0;
  nextColorSlot(inkCount: number): number {
    if (this.pinnedSlot !== null) return this.pinnedSlot;
    return 1 + (this.rotation++ % inkCount);
  }
}
