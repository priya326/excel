import { Grid } from '../../core/grid'; // Adjust path as necessary
import { IEventHandler } from '../IEventHandler';

// Constants from Grid.ts or Grid instance
const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5; // To avoid activating if near resize area

export class RowDragHandler implements IEventHandler {
  private grid: Grid;
  private isDragging: boolean = false;
  private dragStartRow: number | null = null;
  private dragStartMouseY: number = 0; // For drag threshold
  private hasDraggedEnough: boolean = false; // To differentiate click from drag

  // Properties that were in Grid class for row selection
  private rowSelectionAnchor: number | null = null;
  private rowSelectionFocus: number | null = null;

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
    const { y: worldY } = grid.getMousePos(event);

    // Ensure mouse is in the row header area (left of data, below column headers)
    if (mouseX < grid.rowHeaderWidth && mouseY >= HEADER_SIZE) {
      const { row, within } = grid.findRowByOffset(worldY - HEADER_SIZE);
      // Ensure not in resize gutter for the row
      if (within < grid.rowMgr.getHeight(row) - RESIZE_GUTTER && within > RESIZE_GUTTER) { // Check both sides
        return true;
      }
      // Special case for first row (row 0)
      if (row === 0 && within < RESIZE_GUTTER && !(within >= grid.rowMgr.getHeight(row) - RESIZE_GUTTER)) {
        return true;
      }
      // If it's near the start of the row (top side), it's a select, not a resize of row-1
      if (within < RESIZE_GUTTER && row > 0) {
         const { row: prevRow, within: prevWithin } = grid.findRowByOffset(worldY - HEADER_SIZE - RESIZE_GUTTER - 1);
         if (prevRow === row -1 && prevWithin >= grid.rowMgr.getHeight(prevRow) - RESIZE_GUTTER) {
            return false; // It's the resize handle of the previous row
         }
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (!this.hitTest(event, grid)) return;

    if (grid.isEditing()) {
      grid.finishEditing(true);
    }

    grid.selMgr.clearSelection(); // Clear cell and column selections
    grid.selMgr.clearSelectedColumns();

    const { y: worldY } = grid.getMousePos(event);
    const { row: rowIndex } = grid.findRowByOffset(worldY - HEADER_SIZE);

    this.isDragging = true;
    this.dragStartRow = rowIndex;
    this.dragStartMouseY = event.clientY;
    this.hasDraggedEnough = false;

    this.rowSelectionAnchor = rowIndex;
    this.rowSelectionFocus = rowIndex;

    // grid.pendingEditCell = { row: rowIndex, col: 0 }; // Update grid's pending edit cell concept if necessary
    grid.canvas.style.cursor = 'grabbing';
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    if (this.hitTest(event, grid) && !this.isDragging) {
      grid.canvas.style.cursor = 'grab';
    }
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isDragging || this.dragStartRow === null || this.rowSelectionAnchor === null) {
      return;
    }

    if (!this.hasDraggedEnough) {
      const dy = Math.abs(event.clientY - this.dragStartMouseY);
      if (dy > 5) { // Drag threshold
        this.hasDraggedEnough = true;
        grid.selMgr.clearSelectedRows(); // Clear previous before starting new drag selection
        grid.selMgr.addSelectedRow(this.rowSelectionAnchor);
      }
    }

    if (this.hasDraggedEnough) {
      const { y: worldY } = grid.getMousePos(event);
      const { row: currentRow } = grid.findRowByOffset(worldY - HEADER_SIZE);
      this.rowSelectionFocus = currentRow;

      const startRow = Math.min(this.rowSelectionAnchor, this.rowSelectionFocus);
      const endRow = Math.max(this.rowSelectionAnchor, this.rowSelectionFocus);

      const selectedRows: number[] = [];
      for (let r = startRow; r <= endRow; r++) {
        selectedRows.push(r);
      }
      grid.selMgr.setSelectedRows(selectedRows);

      // Auto-scroll logic
      const edgeThreshold = 25;
      const scrollAmount = 40; // Should be based on row height ideally
      const canvasRect = grid.canvas.getBoundingClientRect();
      const mouseYInCanvas = event.clientY - canvasRect.top;

      if (mouseYInCanvas > grid.canvas.clientHeight - edgeThreshold) {
        grid.container.scrollTop += scrollAmount;
      } else if (mouseYInCanvas < edgeThreshold) {
        grid.container.scrollTop -= scrollAmount;
      }
      grid.scheduleRender();
    }
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (!this.isDragging) return;

    if (!this.hasDraggedEnough && this.dragStartRow !== null) {
      grid.selMgr.clearSelectedRows();
      grid.selMgr.selectRow(this.dragStartRow);
      // grid.pendingEditCell = { row: this.dragStartRow, col: 0 };
    } else if (this.rowSelectionAnchor !== null && this.rowSelectionFocus !== null) {
      const startRow = Math.min(this.rowSelectionAnchor, this.rowSelectionFocus);
      const endRow = Math.max(this.rowSelectionAnchor, this.rowSelectionFocus);
      const selectedRows: number[] = [];
      for (let r = startRow; r <= endRow; r++) {
        selectedRows.push(r);
      }
      grid.selMgr.setSelectedRows(selectedRows);
    }

    this.resetState();
    grid.computeSelectionStats();
    grid.updateToolbarState();
    grid.scheduleRender();
    // grid.canvas.style.cursor = 'grab';
  }

  private resetState(): void {
    this.isDragging = false;
    this.dragStartRow = null;
    this.hasDraggedEnough = false;
    this.dragStartMouseY = 0;
    this.rowSelectionAnchor = null;
    this.rowSelectionFocus = null;
  }
}
