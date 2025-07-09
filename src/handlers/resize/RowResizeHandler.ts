import { HeaderResizeHandlerBase } from './HeaderResizeHandlerBase';
import { Grid } from '../../core/grid';
import { ResizeRowCommand } from '../../commands/ResizeRowCommand';
import { CompositeCommand } from '../../commands/CompositeCommand';

export class RowResizeHandler extends HeaderResizeHandlerBase {
  constructor(grid: Grid) { super(grid); }

  hitTest(x: number, y: number): boolean { // x, y are canvas offsetX, offsetY
    const HEADER_SIZE = 40; // Column header height
    const RESIZE_GUTTER = 5;

    // Check if pointer is in the row header area (left of data cells, below column headers)
    // x is canvas-relative, check against fixed row header width area.
    // (this.grid as any).rowHeaderWidth is the actual width of the row number area.
    if (x < (this.grid as any).rowHeaderWidth && y >= HEADER_SIZE) {
      // Convert canvas-relative y to content-relative y for findRowByOffset
      // findRowByOffset expects offset from the start of the data rows (after col headers)
      const contentRelativeY = y + this.grid['container'].scrollTop - HEADER_SIZE;
      const { row, within } = this.grid['findRowByOffset'](contentRelativeY);
      return within >= this.grid['rowMgr'].getHeight(row) - RESIZE_GUTTER;
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