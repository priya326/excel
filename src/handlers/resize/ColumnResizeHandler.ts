import { HeaderResizeHandlerBase } from './HeaderResizeHandlerBase';
import { Grid } from '../../core/grid';
import { ResizeColumnCommand } from '../../commands/ResizeColumnCommand';
import { CompositeCommand } from '../../commands/CompositeCommand';

export class ColumnResizeHandler extends HeaderResizeHandlerBase {
  constructor(grid: Grid) { super(grid); }

  hitTest(x: number, y: number, pointerType?: string): boolean { // x,y are canvas offsetX, offsetY
    const COL_HEADER_HEIGHT = 40; // Actual height of the column header bar
    const MOUSE_RESIZE_GUTTER = 5;
    const TOUCH_RESIZE_GUTTER = 20;

    const effectiveResizeGutter = pointerType === 'touch' ? TOUCH_RESIZE_GUTTER : MOUSE_RESIZE_GUTTER;
    const currentZoom = this.grid.getZoomLevel();
    const logicalCanvasX = x / currentZoom;
    const logicalCanvasY = y / currentZoom;

    const currentGridRowHeaderWidth = this.grid.getRowHeaderWidth(); // Logical width

    if (logicalCanvasY < COL_HEADER_HEIGHT && logicalCanvasX >= currentGridRowHeaderWidth) {
      // Convert canvas-relative x to content-relative x for findColumnByOffset
      // scrollLeft is logical, clientX - rect.left is physical pixels on canvas
      const logicalMouseXOnCanvas = x / currentZoom;
      const contentRelativeX = logicalMouseXOnCanvas + this.grid['container'].scrollLeft - currentGridRowHeaderWidth;

      const { col, within } = this.grid['findColumnByOffset'](contentRelativeX); // within is logical

      // getWidth is logical. effectiveResizeGutter should also be treated as logical here for comparison.
      return within >= this.grid['colMgr'].getWidth(col) - (effectiveResizeGutter / currentZoom) &&
             within <= this.grid['colMgr'].getWidth(col) + (effectiveResizeGutter / (2 * currentZoom));
    }
    return false;
  }

  protected getIndex(evt: MouseEvent): number {
    const { x: contentMouseX } = this.grid['getMousePos'](evt);
    // findColumnByOffset expects offset from the start of the column area (after row headers)
    const currentGridRowHeaderWidth = this.grid.getRowHeaderWidth();
    const { col } = this.grid['findColumnByOffset'](contentMouseX - currentGridRowHeaderWidth);
    return col;
  }

  protected getWithin(contentMouseX: number, contentMouseY: number): number {
    // contentMouseX is from getMousePos, relative to scrollable content origin.
    // findColumnByOffset expects offset from the start of the column area.
    const currentGridRowHeaderWidth = this.grid.getRowHeaderWidth();
    const { col, within } = this.grid['findColumnByOffset'](contentMouseX - currentGridRowHeaderWidth);
    return within;
  }

  protected getHeaderSize(): number { return 40; } // This is the height of the column header bar
  protected getResizeGutter(): number { return 5; }
  protected getManager(): any { return {
    getSize: (col: number) => this.grid['colMgr'].getWidth(col)
  }; }
  protected getSelected(): number[] { return this.grid['selMgr'].getSelectedColumns(); }
  protected getResizeCommand(idx: number, from: number, to: number): any {
    return new ResizeColumnCommand(this.grid, idx, from, to);
  }
  protected getCompositeCommand(cmds: any[]): any { return new CompositeCommand(cmds); }
  protected getMinSize(): number { return 40; }
  protected getCursor(): string { return 'col-resize'; }
  protected getDragDelta(evt: MouseEvent): number {
    const { x: currentContentX } = this.grid['getMousePos'](evt);
    return currentContentX - this.dragStartCoord;
  }
  protected setSize(idx: number, size: number): void {
    this.grid['colMgr'].setWidth(idx, size);
  }
  protected updateEditorPosition(): void {
    this.grid['updateEditorPosition']();
  }
  protected getDragStartCoord(evt: MouseEvent): number {
    // Use content-relative X coordinate for starting drag
    const { x } = this.grid['getMousePos'](evt);
    return x;
  }
}