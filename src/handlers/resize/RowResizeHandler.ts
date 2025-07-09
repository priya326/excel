import { HeaderResizeHandlerBase } from './HeaderResizeHandlerBase';
import { Grid } from '../../core/grid';
import { ResizeRowCommand } from '../../commands/ResizeRowCommand';
import { CompositeCommand } from '../../commands/CompositeCommand';

export class RowResizeHandler extends HeaderResizeHandlerBase {
  constructor(grid: Grid) { super(grid); }

  hitTest(x: number, y: number, pointerType?: string): boolean { // x, y are canvas offsetX, offsetY
    const COL_HEADER_HEIGHT = 40;
    const MOUSE_RESIZE_GUTTER = 5;
    const TOUCH_RESIZE_GUTTER = 20;

    const effectiveResizeGutter = pointerType === 'touch' ? TOUCH_RESIZE_GUTTER : MOUSE_RESIZE_GUTTER;
    const currentZoom = this.grid.getZoomLevel();
    const logicalCanvasX = x / currentZoom;
    const logicalCanvasY = y / currentZoom;

    const currentGridRowHeaderWidth = this.grid.getRowHeaderWidth(); // Logical width

    if (logicalCanvasX < currentGridRowHeaderWidth && logicalCanvasY >= COL_HEADER_HEIGHT) {
      // Convert canvas-relative y to content-relative y for findRowByOffset
      const logicalMouseYOnCanvas = y / currentZoom;
      const contentRelativeY = logicalMouseYOnCanvas + this.grid['container'].scrollTop - COL_HEADER_HEIGHT;
      const { row, within } = this.grid['findRowByOffset'](contentRelativeY); // within is logical

      // getHeight is logical. effectiveResizeGutter should be treated as logical.
      return within >= this.grid['rowMgr'].getHeight(row) - (effectiveResizeGutter / currentZoom) &&
             within <= this.grid['rowMgr'].getHeight(row) + (effectiveResizeGutter / (2 * currentZoom));
    }
    return false;
  }

  protected getIndex(evt: MouseEvent): number {
    const { y } = this.grid['getMousePos'](evt);
    const { row } = this.grid['findRowByOffset'](y - 40);
    return row;
  }

  protected getWithin(contentMouseX: number, contentMouseY: number): number {
    // contentMouseY is already relative to the grid's content area (after headers)
    // We need to subtract the header size before passing to findRowByOffset.
    const { row, within } = this.grid['findRowByOffset'](contentMouseY - this.getHeaderSize());
    return within;
  }

  protected getHeaderSize(): number { return 40; }
  protected getResizeGutter(): number { return 5; }
  protected getManager(): any { return {
    getSize: (row: number) => this.grid['rowMgr'].getHeight(row)
  }; }
  protected getSelected(): number[] { return this.grid['selMgr'].getSelectedRows(); }
  protected getResizeCommand(idx: number, from: number, to: number): any {
    return new ResizeRowCommand(this.grid, idx, from, to);
  }
  protected getCompositeCommand(cmds: any[]): any { return new CompositeCommand(cmds); }
  protected getMinSize(): number { return 20; }
  protected getCursor(): string { return 'row-resize'; }
  protected getDragDelta(evt: MouseEvent): number {
    const { y: currentContentY } = this.grid['getMousePos'](evt);
    return currentContentY - this.dragStartCoord;
  }
  protected setSize(idx: number, size: number): void {
    this.grid['rowMgr'].setHeight(idx, size);
  }
  protected updateEditorPosition(): void {
    this.grid['updateEditorPosition']();
  }
  protected getDragStartCoord(evt: MouseEvent): number {
    // Use content-relative Y coordinate for starting drag
    const { y } = this.grid['getMousePos'](evt);
    return y;
  }
}