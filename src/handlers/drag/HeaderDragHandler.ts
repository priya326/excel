import type { EventHandler } from '../EventHandler';
import { Grid } from '../../core/grid';

export class HeaderDragHandler implements EventHandler {
  private grid: Grid;
  private dragStartColHeader: number | null = null;
  private dragStartMouse: { x: number; y: number } | null = null;
  private isColHeaderDragActive: boolean = false;
  private colHeaderDragged: boolean = false;

  private columnSelectionAnchor: number | null = null;
  private columnSelectionFocus: number | null = null;

  private autoScrollDirection: 'left' | 'right' | null = null;
  private autoScrollAnimationFrameId: number | null = null;
  private lastPointerMoveEvent: MouseEvent | null = null; // To keep track of the latest mouse position

  constructor(grid: Grid) {
    this.grid = grid;
  }

  private stopAutoScroll(): void {
    if (this.autoScrollAnimationFrameId !== null) {
      cancelAnimationFrame(this.autoScrollAnimationFrameId);
      this.autoScrollAnimationFrameId = null;
    }
    this.autoScrollDirection = null;
  }

  private scrollStep(): void {
    if (!this.isColHeaderDragActive || this.autoScrollDirection === null || !this.lastPointerMoveEvent) {
      this.stopAutoScroll();
      return;
    }

    const scrollAmount = 20; // Adjust for desired speed
    const container = this.grid['container'];

    if (this.autoScrollDirection === 'left') {
      container.scrollLeft = Math.max(0, container.scrollLeft - scrollAmount);
    } else if (this.autoScrollDirection === 'right') {
      container.scrollLeft = Math.min(container.scrollWidth - container.clientWidth, container.scrollLeft + scrollAmount);
    }

    // After scrolling, re-evaluate selection based on the latest known mouse position relative to content
    const { x: contentX } = this.grid['getMousePos'](this.lastPointerMoveEvent);
    const HEADER_SIZE = 40;
    const { col: currentColIndex } = this.grid['findColumnByOffset'](contentX - (this.grid as any).rowHeaderWidth);
    this.columnSelectionFocus = currentColIndex;
    this.grid['selMgr'].updateDrag(0, currentColIndex);

    const startCol = Math.min(this.columnSelectionAnchor!, this.columnSelectionFocus!);
    const endCol = Math.max(this.columnSelectionAnchor!, this.columnSelectionFocus!);
    const selectedCols: number[] = [];
    for (let c = startCol; c <= endCol; c++) {
      selectedCols.push(c);
    }
    this.grid['selMgr'].setSelectedColumns(selectedCols);
    this.grid['scheduleRender']();

    // Continue scrolling if direction is still set
    if (this.autoScrollDirection) {
        this.autoScrollAnimationFrameId = requestAnimationFrame(this.scrollStep.bind(this));
    } else {
        this.autoScrollAnimationFrameId = null; // Ensure it's cleared if direction became null
    }
  }

  hitTest(x: number, y: number): boolean { // x, y are canvas offsetX, offsetY
    const COL_HEADER_HEIGHT = 40; // Logical height
    const MOUSE_RESIZE_GUTTER = 5; // Logical gutter for mouse
    // For touch, ColumnResizeHandler uses a larger gutter. We want to make sure HeaderDragHandler
    // doesn't activate if the touch is within that larger touch gutter for resizing.
    const TOUCH_RESIZE_GUTTER = 20;

    const currentZoom = this.grid.getZoomLevel();
    const logicalCanvasX = x / currentZoom;
    const logicalCanvasY = y / currentZoom;

    const currentGridRowHeaderWidth = this.grid.getRowHeaderWidth(); // Logical width

    if (logicalCanvasY < COL_HEADER_HEIGHT && logicalCanvasX >= currentGridRowHeaderWidth) {
      // We need contentRelativeX to use findColumnByOffset
      const contentRelativeX = logicalCanvasX + this.grid['container'].scrollLeft - currentGridRowHeaderWidth;
      const { col, within } = this.grid['findColumnByOffset'](contentRelativeX); // 'within' is logical

      // Determine the effective resize gutter that ColumnResizeHandler would use
      const effectiveResizeGutterForColumnHandler = pointerType === 'touch' ? TOUCH_RESIZE_GUTTER : MOUSE_RESIZE_GUTTER;
      const logicalEffectiveResizeGutter = effectiveResizeGutterForColumnHandler / currentZoom;

      // This handler should activate if NOT in the resize gutter zone ColumnResizeHandler would claim.
      if (within < this.grid['colMgr'].getWidth(col) - logicalEffectiveResizeGutter) {
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
    if (!this.isColHeaderDragActive || this.dragStartColHeader === null) {
        this.stopAutoScroll();
        return;
    }
    this.lastPointerMoveEvent = evt; // Store the latest event for scrollStep

    const { x: contentX } = this.grid['getMousePos'](evt);
    const HEADER_SIZE = 40; // This is column header height, but findColumnByOffset needs offset from row header
    const rowHeaderAreaWidth = (this.grid as any).rowHeaderWidth;


    if (!this.grid['selMgr'].isDragging() && this.dragStartMouse) {
      const dx = Math.abs(evt.clientX - this.dragStartMouse.x);
      if (dx > 2) {
        this.grid['selMgr'].startDrag(0, this.dragStartColHeader);
        this.grid['selMgr'].clearSelectedColumns();
        this.grid['selMgr'].addSelectedColumn(this.dragStartColHeader);
        this.colHeaderDragged = true;
      }
    }

    if (this.grid['selMgr'].isDragging()) {
      const { col: currentColIndex } = this.grid['findColumnByOffset'](contentX - rowHeaderAreaWidth);
      this.columnSelectionFocus = currentColIndex;
      this.grid['selMgr'].updateDrag(0, currentColIndex);

      const startCol = Math.min(this.columnSelectionAnchor!, this.columnSelectionFocus!);
      const endCol = Math.max(this.columnSelectionAnchor!, this.columnSelectionFocus!);
      const selectedCols: number[] = [];
      for (let c = startCol; c <= endCol; c++) {
        selectedCols.push(c);
      }
      this.grid['selMgr'].setSelectedColumns(selectedCols);
      this.grid['scheduleRender'](); // Render normal drag update

      // Auto-scroll logic
      const rect = this.grid['canvas'].getBoundingClientRect();
      const mouseXCanvas = evt.clientX - rect.left;
      const edgeThreshold = 35; // Increased threshold a bit
      const clientWidth = this.grid['canvas'].clientWidth;

      let newScrollDirection: 'left' | 'right' | null = null;
      if (mouseXCanvas > clientWidth - edgeThreshold && mouseXCanvas <= clientWidth) { // Check <= clientWidth
        newScrollDirection = 'right';
      } else if (mouseXCanvas < edgeThreshold && mouseXCanvas >=0) { // Check >= 0
        newScrollDirection = 'left';
      }

      if (newScrollDirection) {
        this.autoScrollDirection = newScrollDirection;
        if (this.autoScrollAnimationFrameId === null) { // Start if not already scrolling
          this.scrollStep();
        }
      } else {
        this.stopAutoScroll();
      }
    } else { // Not dragging with selMgr (e.g. threshold not met yet, or just finished)
        this.stopAutoScroll();
    }
  }

  onPointerUp(evt: MouseEvent): void {
    this.stopAutoScroll(); // Stop any active auto-scrolling

    if (!this.isColHeaderDragActive) return;

    if (!this.colHeaderDragged && this.dragStartColHeader !== null) {
      this.grid['selMgr'].selectColumn(this.dragStartColHeader);
      this.grid['selMgr'].clearSelectedColumns();
      this.grid['selMgr'].addSelectedColumn(this.dragStartColHeader);
    } else if (this.grid['selMgr'].isDragging()) {
      this.grid['selMgr'].endDrag();
      (this.grid as any).pendingEditCell = null;
    }

    this.grid['scheduleRender']();
    this.grid['computeSelectionStats']();
    this.grid['updateToolbarState']();

    this.isColHeaderDragActive = false;
    this.dragStartColHeader = null;
    this.dragStartMouse = null;
    this.colHeaderDragged = false;
    this.columnSelectionAnchor = null;
    this.columnSelectionFocus = null;
  }
}