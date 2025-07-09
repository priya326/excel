import type { EventHandler } from '../EventHandler';
import { Grid } from '../../core/grid';

export class HeaderDragHandler implements EventHandler {
  private grid: Grid;
  private dragStartColHeader: number | null = null;
  private dragStartMouse: { x: number; y: number } | null = null;
  private isColHeaderDragActive: boolean = false; // Renamed from isColHeaderDrag to avoid conflict with grid property if any
  private colHeaderDragged: boolean = false;

  // For managing selection state previously in grid.ts
  private columnSelectionAnchor: number | null = null;
  private columnSelectionFocus: number | null = null;


  constructor(grid: Grid) {
    this.grid = grid;
  }

  hitTest(x: number, y: number): boolean {
    const HEADER_SIZE = 40;
    const RESIZE_GUTTER = 5;
    // Column header (not in gutter)
    if (y < HEADER_SIZE && x >= HEADER_SIZE) {
      // Ensure this isn't a resize hit; ColumnResizeHandler should have higher priority
      const { col, within } = this.grid['findColumnByOffset'](x - HEADER_SIZE);
      if (within < this.grid['colMgr'].getWidth(col) - RESIZE_GUTTER) {
        return true;
      }
    }
    return false;
  }

  onPointerDown(evt: MouseEvent): void {
    // Finish editing if a cell is being edited
    if (this.grid['editorInput'] && this.grid['editingCell']) {
      this.grid['finishEditing'](true);
    }

    const { x } = this.grid['getMousePos'](evt); // x relative to content
    const HEADER_SIZE = 40;
    const { col: colIndex } = this.grid['findColumnByOffset'](x - HEADER_SIZE);

    this.isColHeaderDragActive = true;
    this.colHeaderDragged = false;
    this.dragStartColHeader = colIndex;
    this.columnSelectionAnchor = colIndex;
    this.columnSelectionFocus = colIndex;
    this.dragStartMouse = { x: evt.clientX, y: evt.clientY };

    this.grid['selMgr'].clearSelectedRows(); // Clear row selections
    (this.grid as any).pendingEditCell = { row: 0, col: colIndex }; // Set pending edit cell on grid for now
    // Do NOT select yet; wait for mouseup or drag to differentiate
  }

  onPointerMove(evt: MouseEvent): void {
    const rect = (evt.target as HTMLElement).getBoundingClientRect();
    const mouseX = evt.clientX - rect.left;
    const mouseY = evt.clientY - rect.top;
    const HEADER_SIZE = 40;

    // Default cursor should be handled by a more general handler or grid itself if no specific handler is active
    // this.grid['canvas'].style.cursor = 'cell';

    if (mouseY < HEADER_SIZE && mouseX >= HEADER_SIZE) {
        // Check if it's not a resize hover (ColumnResizeHandler's onPointerMove should handle that)
        const { col, within } = this.grid['findColumnByOffset'](mouseX - HEADER_SIZE);
        const RESIZE_GUTTER = 5;
        if (within < this.grid['colMgr'].getWidth(col) - RESIZE_GUTTER) {
            this.grid['canvas'].style.cursor = 'grab';
        }
        // If it IS a resize gutter, ColumnResizeHandler.onPointerMove will set col-resize
    }
  }

  onPointerDrag(evt: MouseEvent): void {
    if (!this.isColHeaderDragActive || this.dragStartColHeader === null) return;

    const { x: contentX } = this.grid['getMousePos'](evt); // x relative to content
    const HEADER_SIZE = 40;

    if (!this.grid['selMgr'].isDragging() && this.dragStartMouse) {
      const dx = Math.abs(evt.clientX - this.dragStartMouse.x);
      if (dx > 2) { // Drag threshold
        this.grid['selMgr'].startDrag(0, this.dragStartColHeader);
        this.grid['selMgr'].clearSelectedColumns(); // Clear previous before adding new
        this.grid['selMgr'].addSelectedColumn(this.dragStartColHeader);
        this.colHeaderDragged = true;
      }
    }

    if (this.grid['selMgr'].isDragging()) {
      const { col: currentColIndex } = this.grid['findColumnByOffset'](contentX - HEADER_SIZE);
      this.columnSelectionFocus = currentColIndex; // Update focus
      this.grid['selMgr'].updateDrag(0, currentColIndex);

      const startCol = Math.min(this.columnSelectionAnchor!, this.columnSelectionFocus!);
      const endCol = Math.max(this.columnSelectionAnchor!, this.columnSelectionFocus!);
      const selectedCols: number[] = [];
      for (let c = startCol; c <= endCol; c++) {
        selectedCols.push(c);
      }
      this.grid['selMgr'].setSelectedColumns(selectedCols);

      // Auto-scroll
      const rect = this.grid['canvas'].getBoundingClientRect();
      const mouseXCanvas = evt.clientX - rect.left;
      const edgeThreshold = 25;
      const scrollAmount = 40;
      const clientWidth = this.grid['canvas'].clientWidth;

      if (mouseXCanvas > clientWidth - edgeThreshold) {
        this.grid['container'].scrollLeft = Math.min(
          this.grid['container'].scrollLeft + scrollAmount,
          this.grid['container'].scrollWidth - this.grid['container'].clientWidth
        );
      } else if (mouseXCanvas < edgeThreshold) {
        this.grid['container'].scrollLeft = Math.max(
          this.grid['container'].scrollLeft - scrollAmount,
          0
        );
      }
      this.grid['scheduleRender']();
    }
  }

  onPointerUp(evt: MouseEvent): void {
    if (!this.isColHeaderDragActive) return;

    if (!this.colHeaderDragged && this.dragStartColHeader !== null) {
      // Click without drag: select single column
      this.grid['selMgr'].selectColumn(this.dragStartColHeader);
      this.grid['selMgr'].clearSelectedColumns(); // Ensure only one is selected
      this.grid['selMgr'].addSelectedColumn(this.dragStartColHeader);
      // pendingEditCell was already set on pointerDown
    } else if (this.grid['selMgr'].isDragging()) {
      // Drag completed
      this.grid['selMgr'].endDrag();
      (this.grid as any).pendingEditCell = null; // Clear pending edit cell after drag
    }

    this.grid['scheduleRender']();
    this.grid['computeSelectionStats']();
    this.grid['updateToolbarState']();

    // Reset state for this handler
    this.isColHeaderDragActive = false;
    this.dragStartColHeader = null;
    this.dragStartMouse = null;
    this.colHeaderDragged = false;
    this.columnSelectionAnchor = null;
    this.columnSelectionFocus = null;
  }
}