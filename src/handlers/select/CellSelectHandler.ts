import { Grid } from '../../core/grid'; // Adjust path as necessary
import { IEventHandler } from '../IEventHandler';

// Constants from Grid.ts or Grid instance
const HEADER_SIZE = 40;
// No RESIZE_GUTTER needed here as we are in the cell area

export class CellSelectHandler implements IEventHandler {
  private grid: Grid;
  private isDragging: boolean = false;
  private dragStartCellCoords: { row: number; col: number } | null = null;
  private dragStartMousePos: { x: number; y: number } | null = null; // For drag threshold

  constructor(grid: Grid) {
    this.grid = grid;
  }

  private getMouseCanvasCoordinates(event: MouseEvent): { mouseX: number, mouseY: number } {
    const rect = this.grid.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    return { mouseX, mouseY };
  }

  hitTest(event: MouseEvent, grid: Grid): boolean {
    const { mouseX, mouseY } = this.getMouseCanvasCoordinates(event);
    // Check if the click is within the main cell area (not headers)
    return mouseX >= grid.rowHeaderWidth && mouseY >= HEADER_SIZE;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (!this.hitTest(event, grid)) return;

    if (grid.isEditing()) {
      grid.finishEditing(true);
    }

    const { x: worldX, y: worldY } = grid.getMousePos(event);
    const { col } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth);
    const { row } = grid.findRowByOffset(worldY - HEADER_SIZE);

    if (event.button === 0) { // Left click
      grid.selMgr.clearSelectedColumns();
      grid.selMgr.clearSelectedRows();

      // Select cell immediately
      // If shift key is pressed, extend selection (TODO: This might be better in a keyboard handler or a combined selection model)
      // For now, basic click replaces selection.
      grid.selMgr.selectCell(row, col);
      // grid.scrollToCell(row, col); // Scrolling on select can be disruptive, usually done on drag or explicit navigation

      this.isDragging = true; // Prepare for possible drag
      this.dragStartCellCoords = { row, col };
      this.dragStartMousePos = { x: event.clientX, y: event.clientY };

      // grid.pendingEditCell = { row, col }; // Update grid's pending edit concept
      grid.scheduleRender();
    }
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    // If over the cell area and no other handler has set a more specific cursor (like resize)
    if (this.hitTest(event, grid) && !this.isDragging) { // Only set if not actively dragging with this handler
        // The default cursor is 'cell' in grid.ts constructor, so we might not need to set it here
        // unless another handler changed it and didn't reset.
        // grid.canvas.style.cursor = 'cell';
    }
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isDragging || !this.dragStartCellCoords || !this.dragStartMousePos) {
      return;
    }

    // Check if mouse moved enough to start a "visual" drag selection
    if (!grid.selMgr.isDragging()) {
      const dx = Math.abs(event.clientX - this.dragStartMousePos.x);
      const dy = Math.abs(event.clientY - this.dragStartMousePos.y);
      if (dx > 2 || dy > 2) { // Threshold in pixels
        grid.selMgr.startDrag(this.dragStartCellCoords.row, this.dragStartCellCoords.col);
      }
    }

    if (grid.selMgr.isDragging()) {
      const { x: worldX, y: worldY } = grid.getMousePos(event);
      const { col } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth);
      const { row } = grid.findRowByOffset(worldY - HEADER_SIZE);
      grid.selMgr.updateDrag(row, col);

      grid.scrollToCell(row, col); // Auto-scroll while dragging
      grid.scheduleRender();
    }
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (!this.isDragging) return;

    if (grid.selMgr.isDragging()) {
      grid.selMgr.endDrag();
      // grid.pendingEditCell logic from original Grid.onMouseUp might need to be re-evaluated here
      // For example, if a drag rectangle exists and covers more than one cell, set pendingEditCell
      // const dragRect = grid.selMgr.getDragRect();
      // if (dragRect && (dragRect.endRow > dragRect.startRow || dragRect.endCol > dragRect.startCol)) {
      //    // grid.pendingEditCell = { row: dragRect.startRow, col: dragRect.startCol }; // Or based on active cell
      // }
      grid.scheduleRender();
    } else {
      // If not dragging (i.e., it was a simple click, selMgr.isDragging() is false)
      // selectCell was already called on pointerDown.
      // We might still want to update stats.
    }

    this.resetState();
    grid.computeSelectionStats();
    grid.updateToolbarState();
    // No specific cursor change here, default cursor should take over or be set by EventRouter.
  }

  private resetState(): void {
    this.isDragging = false;
    this.dragStartCellCoords = null;
    this.dragStartMousePos = null;
    // Note: selMgr manages its own dragging state (isDragging, dragStart, dragEnd)
  }
}
