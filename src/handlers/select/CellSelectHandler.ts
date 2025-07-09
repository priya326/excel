import type { EventHandler } from "../EventHandler";
import { Grid } from "../../core/grid";

export class CellSelectHandler implements EventHandler {
  private grid: Grid;
  private dragStartCellCoords: { row: number; col: number } | null = null; // Renamed from dragStart
  private dragStartMouseCoords: { x: number; y: number } | null = null; // Renamed from dragStartMouse
  private isCellDragging: boolean = false; // Tracks if cell selection drag is active

  constructor(grid: Grid) {
    this.grid = grid;
  }

  hitTest(x: number, y: number, pointerType?: string): boolean { // x, y are canvas offsetX, offsetY
    const LOGICAL_COL_HEADER_HEIGHT = 40;
    const logicalRowHeaderWidth = this.grid.getRowHeaderWidth(); // This is already logical
    const currentZoom = this.grid.getZoomLevel();

    const logicalCanvasX = x / currentZoom;
    const logicalCanvasY = y / currentZoom;

    // Check if the logical canvas coordinates are within the data cell area
    // (i.e., to the right of row headers and below column headers)
    return logicalCanvasX >= logicalRowHeaderWidth && logicalCanvasY >= LOGICAL_COL_HEADER_HEIGHT;
  }

  onPointerDown(evt: MouseEvent): void {
    if (this.grid["editorInput"] && this.grid["editingCell"]) {
      this.grid['finishEditing'](true);
    }

    const { x: contentX, y: contentY } = this.grid["getMousePos"](evt);
    const HEADER_SIZE = 40;
    const { row } = this.grid["findRowByOffset"](contentY - HEADER_SIZE);
    const { col } = this.grid["findColumnByOffset"](contentX - HEADER_SIZE);

    if (evt.button === 0) { // Left click
      this.grid["selMgr"].clearSelectedRows();
      this.grid["selMgr"].clearSelectedColumns();
      this.grid["selMgr"].selectCell(row, col);

      this.isCellDragging = true; // Indicates a potential drag start
      this.dragStartCellCoords = { row, col };
      this.dragStartMouseCoords = { x: evt.clientX, y: evt.clientY };
      (this.grid as any).pendingEditCell = { row, col }; // Set pending edit cell on grid

      this.grid["scheduleRender"]();
    }
  }

  onPointerMove(evt: MouseEvent): void {
    // Set cursor to 'cell' if hovering over the data area
    // This relies on EventRouter calling onPointerMove for handlers that hitTest true.
    // If another handler (like resize) with higher priority also hitTests true for a specific
    // region within the cell area (which is unlikely for cell area itself), its cursor logic would win.
    const rect = (evt.target as HTMLElement).getBoundingClientRect();
    const mouseX = evt.clientX - rect.left;
    const mouseY = evt.clientY - rect.top;
    if (this.hitTest(mouseX, mouseY)) { // Use own hitTest to be sure
        this.grid['canvas'].style.cursor = "cell";
    }
  }

  onPointerDrag(evt: MouseEvent): void {
    if (!this.isCellDragging || !this.dragStartCellCoords || !this.dragStartMouseCoords) return;

    const HEADER_SIZE = 40;
    const { x: contentX, y: contentY } = this.grid["getMousePos"](evt);

    // Ensure drag is within data area; otherwise, other handlers might take over (though less likely for window events)
    // For cell drag, this check might be redundant if isCellDragging is the sole controller.
    // if (contentX < HEADER_SIZE || contentY < HEADER_SIZE) return;


    if (!this.grid["selMgr"].isDragging()) {
      // Check drag threshold against initial mouse down position
      const dx = Math.abs(evt.clientX - this.dragStartMouseCoords.x);
      const dy = Math.abs(evt.clientY - this.dragStartMouseCoords.y);
      if (dx > 2 || dy > 2) { // Drag threshold
        this.grid["selMgr"].startDrag(this.dragStartCellCoords.row, this.dragStartCellCoords.col);
      }
    }

    if (this.grid["selMgr"].isDragging()) {
      const { col } = this.grid["findColumnByOffset"](contentX - HEADER_SIZE);
      const { row } = this.grid["findRowByOffset"](contentY - HEADER_SIZE);
      this.grid["selMgr"].updateDrag(row, col);

      // If a drag selection exists and covers more than one cell, clear pendingEditCell
      // as a drag typically doesn't result in an immediate edit of the start cell.
      const rect = this.grid['selMgr'].getDragRect();
      if (rect && (rect.endRow > rect.startRow || rect.endCol > rect.startCol)) {
        (this.grid as any).pendingEditCell = null;
      }


      if (typeof this.grid["scrollToCell"] === "function") {
        this.grid["scrollToCell"](row, col);
      }
      this.grid["scheduleRender"]();
    }
  }

  onPointerUp(evt: MouseEvent): void {
    if (!this.isCellDragging) return;

    if (this.grid["selMgr"].isDragging()) {
      this.grid["selMgr"].endDrag();
      // pendingEditCell should have been cleared during drag if multiple cells selected
      this.grid["scheduleRender"]();
      this.grid["computeSelectionStats"]();
      this.grid["updateToolbarState"]();
    } else {
      // This was a click without a drag, pendingEditCell (set on down) remains valid
      // for potential double-click or keyboard interaction.
      // No need to clear pendingEditCell here if it was just a click.
       this.grid["scheduleRender"](); // Ensure single click selection is rendered
       this.grid["computeSelectionStats"]();
       this.grid["updateToolbarState"]();
    }

    // Reset state for this handler
    this.isCellDragging = false;
    this.dragStartCellCoords = null;
    this.dragStartMouseCoords = null;
  }
}
