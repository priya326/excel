import { HeaderResizeHandlerBase } from './HeaderResizeHandlerBase';
import { Grid } from '../../core/grid';
import { ResizeColumnCommand } from '../../commands/ResizeColumnCommand';
import { CompositeCommand } from '../../commands/CompositeCommand';

export class ColumnResizeHandler extends HeaderResizeHandlerBase {
  constructor(grid: Grid) { super(grid); }

  hitTest(x: number, y: number, pointerType?: string): boolean { // x,y are canvas offsetX, offsetY
    const COL_HEADER_HEIGHT = 40; // Actual height of the column header bar
    const MOUSE_RESIZE_GUTTER = 5;
    const TOUCH_RESIZE_GUTTER_PX = 20; // Desired physical gutter size for touch
    const MOUSE_RESIZE_GUTTER_PX = 5;  // Desired physical gutter size for mouse

    const physicalGutter = pointerType === 'touch' ? TOUCH_RESIZE_GUTTER_PX : MOUSE_RESIZE_GUTTER_PX;
    const currentZoom = this.grid.getZoomLevel();
    const logicalGutter = physicalGutter / currentZoom; // Convert desired screen gutter to logical size

    const logicalCanvasX = x / currentZoom;
    const logicalCanvasY = y / currentZoom;

    const logicalRowHeaderWidth = this.grid.getRowHeaderWidth();

    if (logicalCanvasY < COL_HEADER_HEIGHT && logicalCanvasX >= logicalRowHeaderWidth) {
      // Convert logical canvas X to content-relative logical X for findColumnByOffset
      const contentRelativeLogicalX = logicalCanvasX + this.grid['container'].scrollLeft - logicalRowHeaderWidth;
      const { col, within } = this.grid['findColumnByOffset'](contentRelativeLogicalX); // 'within' is logical

      // Compare logical 'within' against logical column width and logical gutter
      // Check if 'within' is near the right edge of the column
      return within >= this.grid['colMgr'].getWidth(col) - logicalGutter &&
             within <= this.grid['colMgr'].getWidth(col) + logicalGutter / 2; // Allow some tolerance past the line
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