export interface EventHandler {
  hitTest(x: number, y: number, pointerType?: string): boolean;
  onPointerDown(evt: MouseEvent): void;
  onPointerMove(evt: MouseEvent): void;
  onPointerUp(evt: MouseEvent): void;
  onPointerDrag(evt: MouseEvent): void;
} 