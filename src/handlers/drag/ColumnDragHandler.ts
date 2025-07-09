import { Grid } from '../../core/grid'; // Adjust path as necessary
import { IEventHandler } from '../IEventHandler';

// Constants from Grid.ts or Grid instance
const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5; // To avoid activating if near resize area

export class ColumnDragHandler implements IEventHandler {
  private grid: Grid;
  private isDragging: boolean = false;
  private dragStartCol: number | null = null;
  private dragStartMouseX: number = 0; // For drag threshold
  private hasDraggedEnough: boolean = false; // To differentiate click from drag

  // Properties that were in Grid class for column selection
  private columnSelectionAnchor: number | null = null;
  private columnSelectionFocus: number | null = null;


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
    const { x: worldX } = grid.getMousePos(event);

    if (mouseY < HEADER_SIZE && mouseX >= grid.rowHeaderWidth) {
      const { col, within } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth);
      // Ensure not in resize gutter
      if (within < grid.colMgr.getWidth(col) - RESIZE_GUTTER && within > RESIZE_GUTTER) { // Check both sides
        return true;
      }
      // Special case for first column, allow selection even if close to left edge if not a resize gutter
      if (col === 0 && within < RESIZE_GUTTER && !(within >= grid.colMgr.getWidth(col) - RESIZE_GUTTER) ) {
         //This is a bit tricky, we want to allow selection if it's not the right-side gutter
         // For col 0, there's no left-side gutter for resizing col -1.
         // Let's assume if it's not the right gutter of col 0, it's a select.
        return true;
      }
       // If it's near the start of the column (left side), it's a select, not a resize of col-1
      if (within < RESIZE_GUTTER && col > 0) { // Make sure it's not the resize handle of col-1
         const { col: prevCol, within: prevWithin } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth - RESIZE_GUTTER -1); // Check just to the left
         if (prevCol === col -1 && prevWithin >= grid.colMgr.getWidth(prevCol) - RESIZE_GUTTER) {
            return false; // It's the resize handle of the previous column
         }
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (!this.hitTest(event, grid)) return;

    // Finish editing before changing selection
    if (grid.isEditing()) {
      grid.finishEditing(true);
    }

    grid.selMgr.clearSelection(); // Clear cell and row selections
    grid.selMgr.clearSelectedRows();


    const { x: worldX } = grid.getMousePos(event);
    const { col: colIndex } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth);

    this.isDragging = true;
    this.dragStartCol = colIndex;
    this.dragStartMouseX = event.clientX;
    this.hasDraggedEnough = false;

    // Initialize selection anchor and focus
    this.columnSelectionAnchor = colIndex;
    this.columnSelectionFocus = colIndex;

    // Update grid's pending edit cell concept if necessary
    // grid.pendingEditCell = { row: 0, col: colIndex }; // This was in original, might need to be signaled differently

    grid.canvas.style.cursor = 'grabbing'; // Or 'default' if selection doesn't change cursor immediately
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    if (this.hitTest(event, grid) && !this.isDragging) { // Only set grab cursor if not actively dragging with this handler
      grid.canvas.style.cursor = 'grab';
    }
    // If dragging with this handler, onPointerDrag will manage cursor or it's already 'grabbing'
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isDragging || this.dragStartCol === null || this.columnSelectionAnchor === null) {
      return;
    }

    if (!this.hasDraggedEnough) {
      const dx = Math.abs(event.clientX - this.dragStartMouseX);
      if (dx > 5) { // Drag threshold in pixels
        this.hasDraggedEnough = true;
        // Initial selection for drag
        grid.selMgr.clearSelectedColumns(); // Clear previous before starting new drag selection
        grid.selMgr.addSelectedColumn(this.columnSelectionAnchor);
      }
    }

    if (this.hasDraggedEnough) {
      const { x: worldX } = grid.getMousePos(event);
      const { col: currentCol } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth);
      this.columnSelectionFocus = currentCol;

      const startCol = Math.min(this.columnSelectionAnchor, this.columnSelectionFocus);
      const endCol = Math.max(this.columnSelectionAnchor, this.columnSelectionFocus);

      const selectedCols: number[] = [];
      for (let c = startCol; c <= endCol; c++) {
        selectedCols.push(c);
      }
      grid.selMgr.setSelectedColumns(selectedCols);

      // Auto-scroll logic (simplified from Grid.ts)
      const edgeThreshold = 25; // px from edge
      const scrollAmount = 40; // px to scroll
      const canvasRect = grid.canvas.getBoundingClientRect();
      const mouseXInCanvas = event.clientX - canvasRect.left;

      if (mouseXInCanvas > grid.canvas.clientWidth - edgeThreshold) {
        grid.container.scrollLeft += scrollAmount;
      } else if (mouseXInCanvas < edgeThreshold) {
        grid.container.scrollLeft -= scrollAmount;
      }

      grid.scheduleRender();
    }
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (!this.isDragging) return;

    if (!this.hasDraggedEnough && this.dragStartCol !== null) {
      // This was a click, not a drag
      grid.selMgr.clearSelectedColumns(); // Clear any columns selected by anchor/focus init
      grid.selMgr.selectColumn(this.dragStartCol); // Select only the clicked column
      // grid.pendingEditCell = { row: 0, col: this.dragStartCol };
    } else if (this.columnSelectionAnchor !== null && this.columnSelectionFocus !== null) {
      // This was a drag
      const startCol = Math.min(this.columnSelectionAnchor, this.columnSelectionFocus);
      const endCol = Math.max(this.columnSelectionAnchor, this.columnSelectionFocus);
      const selectedCols: number[] = [];
      for (let c = startCol; c <= endCol; c++) {
        selectedCols.push(c);
      }
      grid.selMgr.setSelectedColumns(selectedCols); // Finalize selection
    }

    this.resetState();
    grid.computeSelectionStats(); // Update stats based on new selection
    grid.updateToolbarState();   // Update toolbar based on new selection
    grid.scheduleRender();
    // grid.canvas.style.cursor = 'grab'; // Or default after operation
  }

  private resetState(): void {
    this.isDragging = false;
    this.dragStartCol = null;
    this.hasDraggedEnough = false;
    this.dragStartMouseX = 0;
    // Reset anchor/focus? Or should they persist for shift-clicks?
    // For now, let's reset them as this handler is for drag selection.
    // Shift-click selection might be a different handler or part of KeyboardHandler.
    this.columnSelectionAnchor = null;
    this.columnSelectionFocus = null;
  }
}
