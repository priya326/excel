import { HeaderResizeHandlerBase } from './HeaderResizeHandlerBase';
import { Grid } from '../../core/grid';
import { ResizeRowCommand } from '../../commands/ResizeRowCommand';
import { CompositeCommand } from '../../commands/CompositeCommand';

export class RowResizeHandler extends HeaderResizeHandlerBase {
  constructor(grid: Grid) { super(grid); }

  hitTest(x: number, y: number, pointerType?: string): boolean { // x, y are canvas offsetX, offsetY
    const COL_HEADER_HEIGHT = 40;
    const MOUSE_RESIZE_GUTTER = 5;
    const TOUCH_RESIZE_GUTTER_PX = 20; // Desired physical gutter size for touch
    const MOUSE_RESIZE_GUTTER_PX = 5;  // Desired physical gutter size for mouse

    const physicalGutter = pointerType === 'touch' ? TOUCH_RESIZE_GUTTER_PX : MOUSE_RESIZE_GUTTER_PX;
    const currentZoom = this.grid.getZoomLevel();
    const logicalGutter = physicalGutter / currentZoom;

    const logicalCanvasX = x / currentZoom;
    const logicalCanvasY = y / currentZoom;

    const logicalRowHeaderWidth = this.grid.getRowHeaderWidth();

    if (logicalCanvasX < logicalRowHeaderWidth && logicalCanvasY >= COL_HEADER_HEIGHT) {
      // Convert logical canvas Y to content-relative logical Y for findRowByOffset
      const contentRelativeLogicalY = logicalCanvasY + this.grid['container'].scrollTop - COL_HEADER_HEIGHT;
      const { row, within } = this.grid['findRowByOffset'](contentRelativeLogicalY); // 'within' is logical

      // Compare logical 'within' against logical row height and logical gutter
      // Check if 'within' is near the bottom edge of the row
      return within >= this.grid['rowMgr'].getHeight(row) - logicalGutter &&
             within <= this.grid['rowMgr'].getHeight(row) + logicalGutter / 2; // Allow some tolerance past the line
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