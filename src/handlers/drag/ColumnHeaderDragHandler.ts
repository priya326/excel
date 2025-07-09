import type { Grid } from '../../core/grid';
import { IGridOperationHandler } from '../IGridOperationHandler';

const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5; // To differentiate from resize action

export class ColumnHeaderDragHandler implements IGridOperationHandler {
  private isActive: boolean = false;
  private dragStartColHeader: number | null = null;
  private dragStartMouse: { x: number; y: number } | null = null;
  private hasDragged: boolean = false;

  // Helper method to get mouse position relative to canvas
  private getMouseCanvasPos(event: MouseEvent, grid: Grid): { x: number; y: number } {
    const rect = grid.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private findColumnByOffset(offsetX: number, grid: Grid): { col: number; within: number } {
    let x = 0;
    const totalCols = grid.colMgr.getCount(); // Use getCount() method
    for (let c = 0; c < totalCols; c++) {
      const w = grid.colMgr.getWidth(c);
      if (offsetX < x + w) return { col: c, within: offsetX - x };
      x += w;
    }
    return { col: totalCols > 0 ? totalCols - 1 : 0, within: 0 }; // Handle empty case
  }

  isHit(event: MouseEvent, grid: Grid): boolean {
    const { x: mouseX, y: mouseY } = this.getMouseCanvasPos(event, grid);
    const { x: viewX } = grid.getMousePos(event);

    if (mouseY < HEADER_SIZE && mouseX >= grid.rowHeaderWidth) {
      const { col, within } = this.findColumnByOffset(viewX - grid.rowHeaderWidth, grid);
      // Ensure it's not a resize hit
      if (within < grid.colMgr.getWidth(col) - RESIZE_GUTTER) {
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (grid.isEditing()) grid.finishEditing(true); // grid.isEditing() and grid.finishEditing() need to be public

    const { x: viewX } = grid.getMousePos(event);
    const { col: colIndex } = this.findColumnByOffset(viewX - grid.rowHeaderWidth, grid);

    this.isActive = true;
    this.dragStartColHeader = colIndex;
    this.dragStartMouse = { x: event.clientX, y: event.clientY };
    this.hasDragged = false;

    grid.selMgr.clearSelectedRows();
    grid.selMgr.clearSelectedColumns(); // Clear previous column selections
    grid.selMgr.selectColumn(colIndex, false); // Select current column, don't extend yet

    // Set anchor for potential shift+click extension later, though this handler focuses on drag
    grid.columnSelectionAnchor = colIndex;
    grid.columnSelectionFocus = colIndex;
    grid.pendingEditCell = { row: 0, col: colIndex }; // grid.pendingEditCell needs to be public or have setter

    grid.canvas.style.cursor = 'grabbing';
    (grid.canvas as HTMLElement).setPointerCapture(event.pointerId);
    grid.scheduleRender();
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    // This is for canvas move, drag is on window via onPointerDrag
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
    if (!this.isActive || this.dragStartColHeader === null || !this.dragStartMouse) return;

    if (!this.hasDragged) {
      const dx = Math.abs(event.clientX - this.dragStartMouse.x);
      if (dx > 2) { // Threshold to initiate drag
        this.hasDragged = true;
        // grid.selMgr.startDrag(0, this.dragStartColHeader); // selMgr might not need this if we manage selection directly
      }
    }

    if (this.hasDragged) {
      const { x: viewX } = grid.getMousePos(event);
      const { col: currentCol } = this.findColumnByOffset(viewX - grid.rowHeaderWidth, grid);

      const startCol = Math.min(this.dragStartColHeader, currentCol);
      const endCol = Math.max(this.dragStartColHeader, currentCol);

      const selectedCols: number[] = [];
      for (let c = startCol; c <= endCol; c++) {
        selectedCols.push(c);
      }
      grid.selMgr.setSelectedColumns(selectedCols); // selMgr.setSelectedColumns must be public
      grid.columnSelectionFocus = currentCol; // Update focus for consistency

      // Auto-scroll logic (simplified from grid.ts)
      const rect = grid.canvas.getBoundingClientRect();
      const mouseXCanvas = event.clientX - rect.left;
      const edgeThreshold = 25;
      const scrollAmount = 40;
      const clientWidth = grid.canvas.clientWidth;

      if (mouseXCanvas > clientWidth - edgeThreshold) {
        grid.container.scrollLeft = Math.min(
          grid.container.scrollLeft + scrollAmount,
          grid.container.scrollWidth - grid.container.clientWidth
        );
      } else if (mouseXCanvas < edgeThreshold) {
        grid.container.scrollLeft = Math.max(
          grid.container.scrollLeft - scrollAmount,
          0
        );
      }
      grid.scheduleRender();
    }
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (!this.isActive) return;

    if (!this.hasDragged && this.dragStartColHeader !== null) {
      // Single click on header, selMgr.selectColumn already handled it in onPointerDown
      // We ensure only that column is selected.
      grid.selMgr.clearSelectedColumns();
      grid.selMgr.addSelectedColumn(this.dragStartColHeader); // addSelectedColumn needs to be public
    }
    // If it was a drag, selMgr.setSelectedColumns has already been called.

    this.isActive = false;
    this.dragStartColHeader = null;
    this.dragStartMouse = null;
    this.hasDragged = false;

    grid.canvas.style.cursor = 'grab'; // Or 'cell' or let EventRouter reset
    (grid.canvas as HTMLElement).releasePointerCapture(event.pointerId);

    grid.computeSelectionStats(); // Method must be public
    grid.updateToolbarState();   // Method must be public
    grid.scheduleRender();
  }
}
