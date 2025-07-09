import type { EventHandler } from '../EventHandler';
import { Grid } from '../../core/grid';

export class RowSelectHandler implements EventHandler {
  private grid: Grid;
  private dragStartRow: number | null = null;
  private dragStartMouse: { x: number; y: number } | null = null;
  private isRowHeaderDragActive: boolean = false; // Tracks if this handler is active
  private rowHeaderDragged: boolean = false; // Tracks if actual dragging occurred

  private rowSelectionAnchor: number | null = null;
  private rowSelectionFocus: number | null = null;

  constructor(grid: Grid) { this.grid = grid; }

  hitTest(x: number, y: number): boolean {
    const HEADER_SIZE = 40;
    const RESIZE_GUTTER = 5; // Assuming RowResizeHandler has priority for the gutter
    if (x < HEADER_SIZE && y >= HEADER_SIZE) {
        const { within } = this.grid['findRowByOffset'](y - HEADER_SIZE);
        // Make sure it's not a resize hit
        // This relies on RowResizeHandler being checked first or having a more specific hitTest
        // For now, assume if RowResizeHandler didn't claim it, this can.
        // A more robust way would be to check `within < this.grid['rowMgr'].getHeight(row) - RESIZE_GUTTER`
        // but that requires getting the row index here.
      return true;
    }
    return false;
  }

  onPointerDown(evt: MouseEvent): void {
    if (this.grid['editorInput'] && this.grid['editingCell']) {
      this.grid['finishEditing'](true);
    }

    const { y: contentY } = this.grid['getMousePos'](evt);
    const HEADER_SIZE = 40;
    const { row: rowIndex } = this.grid['findRowByOffset'](contentY - HEADER_SIZE);

    this.isRowHeaderDragActive = true;
    this.rowHeaderDragged = false;
    this.dragStartRow = rowIndex;
    this.rowSelectionAnchor = rowIndex;
    this.rowSelectionFocus = rowIndex;
    this.dragStartMouse = { x: evt.clientX, y: evt.clientY };

    this.grid['selMgr'].clearSelectedColumns();
    (this.grid as any).pendingEditCell = { row: rowIndex, col: 0 };
  }

  onPointerMove(evt: MouseEvent): void {
    const rect = (evt.target as HTMLElement).getBoundingClientRect();
    const mouseX = evt.clientX - rect.left;
    const mouseY = evt.clientY - rect.top;
    const HEADER_SIZE = 40;
    const RESIZE_GUTTER = 5;

    if (mouseX < HEADER_SIZE && mouseY >= HEADER_SIZE) {
        const { row, within } = this.grid['findRowByOffset'](mouseY - HEADER_SIZE);
        if (within < this.grid['rowMgr'].getHeight(row) - RESIZE_GUTTER) {
             this.grid['canvas'].style.cursor = 'grab';
        }
        // If it IS a resize gutter, RowResizeHandler.onPointerMove will set row-resize
    }
  }

  onPointerDrag(evt: MouseEvent): void {
    if (!this.isRowHeaderDragActive || this.dragStartRow === null) return;

    const { y: contentY } = this.grid['getMousePos'](evt);
    const HEADER_SIZE = 40;
    const { row: currentRowIndex } = this.grid['findRowByOffset'](contentY - HEADER_SIZE);

    if (!this.grid['selMgr'].isDragging() && this.dragStartMouse) {
      const dy = Math.abs(evt.clientY - this.dragStartMouse.y);
      if (dy > 2) { // Drag threshold
        this.grid['selMgr'].startDrag(this.dragStartRow, 0);
        this.grid['selMgr'].clearSelectedRows();
        this.grid['selMgr'].addSelectedRow(this.dragStartRow);
        this.rowHeaderDragged = true;
      }
    }

    if (this.grid['selMgr'].isDragging()) {
      this.rowSelectionFocus = currentRowIndex;
      this.grid['selMgr'].updateDrag(currentRowIndex, 0);

      const startRow = Math.min(this.rowSelectionAnchor!, this.rowSelectionFocus!);
      const endRow = Math.max(this.rowSelectionAnchor!, this.rowSelectionFocus!);
      const selectedRows: number[] = [];
      for (let r = startRow; r <= endRow; r++) selectedRows.push(r);
      this.grid['selMgr'].setSelectedRows(selectedRows);

      // Auto-scroll vertically
      const rect = this.grid['canvas'].getBoundingClientRect();
      const mouseYCanvas = evt.clientY - rect.top;
      const edgeThreshold = 25;
      const scrollAmount = 10; // As in grid.ts
      const clientHeight = this.grid['canvas'].clientHeight;

      if (mouseYCanvas > clientHeight - edgeThreshold) {
        this.grid['container'].scrollTop = Math.min(
          this.grid['container'].scrollTop + scrollAmount,
          this.grid['container'].scrollHeight - this.grid['container'].clientHeight
        );
      } else if (mouseYCanvas < edgeThreshold) {
        this.grid['container'].scrollTop = Math.max(
          this.grid['container'].scrollTop - scrollAmount,
          0
        );
      }
      this.grid['scheduleRender']();
    }
  }

  onPointerUp(evt: MouseEvent): void {
    if (!this.isRowHeaderDragActive) return;

    if (!this.rowHeaderDragged && this.dragStartRow !== null) {
      // Click without drag
      this.grid['selMgr'].selectRow(this.dragStartRow);
      this.grid['selMgr'].clearSelectedRows();
      this.grid['selMgr'].addSelectedRow(this.dragStartRow);
       // pendingEditCell was already set on pointerDown
    } else if (this.grid['selMgr'].isDragging()) {
      this.grid['selMgr'].endDrag();
      (this.grid as any).pendingEditCell = null; // Clear pending edit cell after drag
    }

    this.grid['scheduleRender']();
    this.grid['computeSelectionStats']();
    this.grid['updateToolbarState']();

    // Reset state for this handler
    this.isRowHeaderDragActive = false;
    this.rowHeaderDragged = false;
    this.dragStartRow = null;
    this.dragStartMouse = null;
    this.rowSelectionAnchor = null;
    this.rowSelectionFocus = null;
  }
}