import type { Grid } from '../../core/grid';
import { IGridOperationHandler } from '../IGridOperationHandler';

const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5; // To differentiate from resize action

export class RowHeaderDragHandler implements IGridOperationHandler {
  private isActive: boolean = false;
  private dragStartRowHeader: number | null = null;
  private dragStartMouse: { x: number; y: number } | null = null;
  private hasDragged: boolean = false;

  private getMouseCanvasPos(event: MouseEvent, grid: Grid): { x: number; y: number } {
    const rect = grid.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private findRowByOffset(offsetY: number, grid: Grid): { row: number; within: number } {
    let y = 0;
    const totalRows = grid.rowMgr.getCount(); // Use getCount() method
    for (let r = 0; r < totalRows; r++) {
      const h = grid.rowMgr.getHeight(r);
      if (offsetY < y + h) return { row: r, within: offsetY - y };
      y += h;
    }
    return { row: totalRows > 0 ? totalRows - 1 : 0, within: 0 }; // Handle empty case
  }

  isHit(event: MouseEvent, grid: Grid): boolean {
    const { x: mouseX, y: mouseY } = this.getMouseCanvasPos(event, grid);
    const { y: viewY } = grid.getMousePos(event);

    if (mouseX < grid.rowHeaderWidth && mouseY >= HEADER_SIZE) {
      const { row, within } = this.findRowByOffset(viewY - HEADER_SIZE, grid);
      if (within < grid.rowMgr.getHeight(row) - RESIZE_GUTTER) {
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (grid.isEditing()) grid.finishEditing(true);

    const { y: viewY } = grid.getMousePos(event);
    const { row: rowIndex } = this.findRowByOffset(viewY - HEADER_SIZE, grid);

    this.isActive = true;
    this.dragStartRowHeader = rowIndex;
    this.dragStartMouse = { x: event.clientX, y: event.clientY };
    this.hasDragged = false;

    grid.selMgr.clearSelectedColumns();
    grid.selMgr.clearSelectedRows(); // Clear previous row selections
    grid.selMgr.selectRow(rowIndex, false); // Select current row, don't extend

    grid.rowSelectionAnchor = rowIndex;
    grid.rowSelectionFocus = rowIndex;
    grid.pendingEditCell = { row: rowIndex, col: 0 };

    grid.canvas.style.cursor = 'grabbing';
    (grid.canvas as HTMLElement).setPointerCapture(event.pointerId);
    grid.scheduleRender();
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    if (!this.isActive) {
      if (this.isHit(event, grid)) {
        grid.canvas.style.cursor = 'grab';
      }
    }
  }

  public updateCursor(event: MouseEvent, grid: Grid): boolean {
    if (this.isHit(event, grid)) {
      grid.canvas.style.cursor = 'grab';
      return true;
    }
    return false;
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isActive || this.dragStartRowHeader === null || !this.dragStartMouse) return;

    if (!this.hasDragged) {
      const dy = Math.abs(event.clientY - this.dragStartMouse.y);
      if (dy > 2) { // Threshold
        this.hasDragged = true;
      }
    }

    if (this.hasDragged) {
      const { y: viewY } = grid.getMousePos(event);
      const { row: currentRow } = this.findRowByOffset(viewY - HEADER_SIZE, grid);

      const startRow = Math.min(this.dragStartRowHeader, currentRow);
      const endRow = Math.max(this.dragStartRowHeader, currentRow);

      const selectedRows: number[] = [];
      for (let r = startRow; r <= endRow; r++) {
        selectedRows.push(r);
      }
      grid.selMgr.setSelectedRows(selectedRows);
      grid.rowSelectionFocus = currentRow;

      // Auto-scroll logic
      const rect = grid.canvas.getBoundingClientRect();
      const mouseYCanvas = event.clientY - rect.top;
      const edgeThreshold = 25;
      const scrollAmount = 10; // Typically less than horizontal scroll
      const clientHeight = grid.canvas.clientHeight;

      if (mouseYCanvas > clientHeight - edgeThreshold) {
        grid.container.scrollTop = Math.min(
          grid.container.scrollTop + scrollAmount,
          grid.container.scrollHeight - grid.container.clientHeight
        );
      } else if (mouseYCanvas < edgeThreshold) {
        grid.container.scrollTop = Math.max(
          grid.container.scrollTop - scrollAmount,
          0
        );
      }
      grid.scheduleRender();
    }
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (!this.isActive) return;

    if (!this.hasDragged && this.dragStartRowHeader !== null) {
      grid.selMgr.clearSelectedRows();
      grid.selMgr.addSelectedRow(this.dragStartRowHeader); // addSelectedRow must be public
    }

    this.isActive = false;
    this.dragStartRowHeader = null;
    this.dragStartMouse = null;
    this.hasDragged = false;

    grid.canvas.style.cursor = 'grab';
    (grid.canvas as HTMLElement).releasePointerCapture(event.pointerId);

    grid.computeSelectionStats();
    grid.updateToolbarState();
    grid.scheduleRender();
  }
}
