import type { Grid } from '../../core/grid';
import { IGridOperationHandler } from '../IGridOperationHandler';

const HEADER_SIZE = 40;

export class CellSelectionHandler implements IGridOperationHandler {
  private isActive: boolean = false; // Tracks if this handler is performing an operation (mousedown until mouseup)
  private isDragging: boolean = false; // Tracks if a drag selection is in progress
  private dragStartCell: { row: number; col: number } | null = null;
  private dragStartMouse: { x: number; y: number } | null = null; // Mouse position when drag started

  private getMouseCanvasPos(event: MouseEvent, grid: Grid): { x: number; y: number } {
    const rect = grid.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private findColumnByOffset(offsetX: number, grid: Grid): { col: number; within: number } {
    let x = 0;
    // Assumes grid.rowHeaderWidth is accessible
    for (let c = 0; c < grid.colMgr.getTotalColumns(); c++) {
      const w = grid.colMgr.getWidth(c);
      if (offsetX < x + w) return { col: c, within: offsetX - x };
      x += w;
    }
    return { col: grid.colMgr.getTotalColumns() - 1, within: 0 };
  }

  private findRowByOffset(offsetY: number, grid: Grid): { row: number; within: number } {
    let y = 0;
    for (let r = 0; r < grid.rowMgr.getTotalRows(); r++) {
      const h = grid.rowMgr.getHeight(r);
      if (offsetY < y + h) return { row: r, within: offsetY - y };
      y += h;
    }
    return { row: grid.rowMgr.getTotalRows() - 1, within: 0 };
  }

  isHit(event: MouseEvent, grid: Grid): boolean {
    const { x: mouseX, y: mouseY } = this.getMouseCanvasPos(event, grid);
    // Assumes grid.rowHeaderWidth is accessible
    return mouseX >= grid.rowHeaderWidth && mouseY >= HEADER_SIZE;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (grid.isEditing()) grid.finishEditing(true);

    const { x: viewX, y: viewY } = grid.getMousePos(event);
    // Assumes grid.rowHeaderWidth is accessible
    const { col } = this.findColumnByOffset(viewX - grid.rowHeaderWidth, grid);
    const { row } = this.findRowByOffset(viewY - HEADER_SIZE, grid);

    if (event.button === 0) { // Left click
      this.isActive = true;

      grid.selMgr.clearSelectedColumns();
      grid.selMgr.clearSelectedRows();

      // Select cell immediately
      grid.selMgr.selectCell(row, col);
      // grid.scrollToCell(row, col); // Scrolling might be better handled by Grid post-selection if needed

      // Prepare for possible drag selection
      this.dragStartCell = { row, col };
      this.dragStartMouse = { x: event.clientX, y: event.clientY };
      this.isDragging = false;

      grid.pendingEditCell = { row, col }; // Update pending edit cell

      (grid.canvas as HTMLElement).setPointerCapture(event.pointerId);
      grid.scheduleRender();
      grid.computeSelectionStats();
      grid.updateToolbarState();
    }
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    // This is for canvas move. Actual drag logic is in onPointerDrag
    // No specific hover effects for cell selection beyond the default cursor handled by EventRouter
  }

  public updateCursor(event: MouseEvent, grid: Grid): boolean {
    if (this.isHit(event, grid)) {
      grid.canvas.style.cursor = 'cell'; // Default cell cursor
      return true;
    }
    return false;
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isActive || !this.dragStartCell || !this.dragStartMouse) return;

    // If not already dragging, check if mouse moved enough to start drag
    if (!this.isDragging) {
      const dx = Math.abs(event.clientX - this.dragStartMouse.x);
      const dy = Math.abs(event.clientY - this.dragStartMouse.y);
      if (dx > 2 || dy > 2) { // Threshold in pixels
        this.isDragging = true;
        grid.selMgr.startDrag(this.dragStartCell.row, this.dragStartCell.col);
      }
    }

    if (this.isDragging) {
      const { x: viewX, y: viewY } = grid.getMousePos(event);
      // Assumes grid.rowHeaderWidth is accessible
      const { col } = this.findColumnByOffset(viewX - grid.rowHeaderWidth, grid);
      const { row } = this.findRowByOffset(viewY - HEADER_SIZE, grid);

      grid.selMgr.updateDrag(row, col);
      grid.scrollToCell(row, col); // Method needs to be public
      grid.scheduleRender();
    }
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (!this.isActive) return;

    if (this.isDragging) {
      grid.selMgr.endDrag();
      // Stats and toolbar are updated once after drag ends or single click
    }
    // If it was a single click (not a drag), selection was already made in onPointerDown.

    this.isActive = false;
    this.isDragging = false;
    this.dragStartCell = null;
    this.dragStartMouse = null;

    (grid.canvas as HTMLElement).releasePointerCapture(event.pointerId);

    // Update toolbar and stats once after operation ends
    grid.computeSelectionStats();
    grid.updateToolbarState();
    grid.scheduleRender();
  }
}
