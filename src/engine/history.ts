import type { Scene } from "../model/types";

export class History {
  private snaps: string[] = [];
  private idx = -1;
  constructor(private cap = 100) {}

  reset(scene: Scene): void {
    this.snaps = [JSON.stringify(scene)];
    this.idx = 0;
  }
  push(scene: Scene): void {
    this.snaps = this.snaps.slice(0, this.idx + 1);
    this.snaps.push(JSON.stringify(scene));
    if (this.snaps.length > this.cap) this.snaps.shift();
    this.idx = this.snaps.length - 1;
  }
  undo(): Scene | null {
    if (!this.canUndo) return null;
    this.idx--;
    return JSON.parse(this.snaps[this.idx]!) as Scene;
  }
  redo(): Scene | null {
    if (!this.canRedo) return null;
    this.idx++;
    return JSON.parse(this.snaps[this.idx]!) as Scene;
  }
  get canUndo(): boolean { return this.idx > 0; }
  get canRedo(): boolean { return this.idx < this.snaps.length - 1; }
}
