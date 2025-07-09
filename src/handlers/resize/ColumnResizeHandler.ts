import type { Grid } from '../../core/grid';
import { IGridOperationHandler } from '../IGridOperationHandler';
import { ResizeColumnCommand } from '../../commands/ResizeColumnCommand';
import { CompositeCommand } from '../../commands/CompositeCommand';

// These constants might be better accessed from a shared config or from the Grid instance
const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5;

export class ColumnResizeHandler implements IGridOperationHandler {
  private resizingCol: number | null = null;
  private dragStartX: number = 0;
  private originalSize: number = 0;
  private isResizing: boolean = false;
  private currentResizeCommand: ResizeColumnCommand | CompositeCommand | null = null;

  // Helper method to get mouse position relative to canvas
  private getMouseCanvasPos(event: MouseEvent, grid: Grid): { x: number; y: number } {
    const rect = grid.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  // Helper method to find column by offset, relative to data area
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
      const dataAreaX = viewX - grid.rowHeaderWidth;
      const { col, within } = this.findColumnByOffset(dataAreaX, grid);
      if (col < 0) return false; // Should not happen if findColumnByOffset is correct
      if (within >= grid.colMgr.getWidth(col) - RESIZE_GUTTER) {
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    const { x: viewX } = grid.getMousePos(event);
    const { col } = this.findColumnByOffset(viewX - grid.rowHeaderWidth, grid); // grid.rowHeaderWidth

    this.resizingCol = col;
    this.dragStartX = event.clientX;
    this.originalSize = grid.colMgr.getWidth(col);
    this.isResizing = true;

    // Composite command for multi-column resize
    const selectedCols = grid.selMgr.getSelectedColumns();
    if (selectedCols.length > 1 && selectedCols.includes(col)) {
      const commands = selectedCols.map(
        (c) =>
          new ResizeColumnCommand(
            grid,
            c,
            grid.colMgr.getWidth(c),
            grid.colMgr.getWidth(c)
          )
      );
      this.currentResizeCommand = new CompositeCommand(commands);
    } else {
      this.currentResizeCommand = new ResizeColumnCommand(
        grid,
        this.resizingCol,
        this.originalSize,
        this.originalSize
      );
    }
    // grid.ctx.strokeStyle = "#107C41"; // Visual feedback might be handled by main render loop
    // grid.ctx.lineWidth = 2 / (window.devicePixelRatio || 1);
    grid.canvas.style.cursor = 'col-resize';
    (grid.canvas as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    // This onPointerMove is for when the handler is NOT active (hover effects)
    // The actual dragging is handled by onPointerDrag
    if (!this.isResizing) {
        if (this.isHit(event, grid)) {
            grid.canvas.style.cursor = 'col-resize';
        } else {
            // grid.canvas.style.cursor = 'cell'; // Or whatever the default is, let EventRouter handle default
        }
    }
  }

  // Specific method for EventRouter to call for cursor updates when no handler is active
  public updateCursor(event: MouseEvent, grid: Grid): boolean {
    if (this.isHit(event, grid)) {
      grid.canvas.style.cursor = 'col-resize';
      return true; // Cursor was set by this handler
    }
    return false; // Cursor not set
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isResizing || this.resizingCol === null || !this.currentResizeCommand) return;

    const dx = event.clientX - this.dragStartX;
    const newW = Math.max(40, this.originalSize + dx); // Ensure minimum width

    const selectedCols = grid.selMgr.getSelectedColumns();
    if (
      selectedCols.length > 1 &&
      selectedCols.includes(this.resizingCol) &&
      this.currentResizeCommand instanceof CompositeCommand
    ) {
      for (let i = 0; i < selectedCols.length; i++) {
        const currentCol = selectedCols[i];
        grid.colMgr.setWidth(currentCol, newW);
        const cmd = this.currentResizeCommand.commands[i];
        if (cmd instanceof ResizeColumnCommand) { // Type guard
          cmd.updateNewSize(newW);
        }
      }
    } else if (this.currentResizeCommand instanceof ResizeColumnCommand) { // Type guard
      grid.colMgr.setWidth(this.resizingCol, newW);
      this.currentResizeCommand.updateNewSize(newW);
    }

    grid.updateEditorPosition(); // Method must be public on Grid
    grid.scheduleRender(); // Method must be public on Grid
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (this.isResizing && this.currentResizeCommand) {
      grid.commandManager.execute(this.currentResizeCommand); // commandManager must be public or have a public method
    }
    this.resizingCol = null;
    this.isResizing = false;
    this.currentResizeCommand = null;
    grid.canvas.style.cursor = 'cell'; // Reset cursor
    (grid.canvas as HTMLElement).releasePointerCapture(event.pointerId);
    grid.scheduleRender(); // Ensure grid redraws after resize commit
  }
}
