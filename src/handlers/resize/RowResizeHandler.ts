import type { Grid } from '../../core/grid';
import { IGridOperationHandler } from '../IGridOperationHandler';
import { ResizeRowCommand } from '../../commands/ResizeRowCommand';
import { CompositeCommand } from '../../commands/CompositeCommand';

// These constants might be better accessed from a shared config or from the Grid instance
const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5;

export class RowResizeHandler implements IGridOperationHandler {
  private resizingRow: number | null = null;
  private dragStartY: number = 0;
  private originalSize: number = 0;
  private isResizing: boolean = false;
  private currentResizeCommand: ResizeRowCommand | CompositeCommand | null = null;

  // Helper method to get mouse position relative to canvas
  private getMouseCanvasPos(event: MouseEvent, grid: Grid): { x: number; y: number } {
    const rect = grid.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  // Helper method to find row by offset, relative to data area
  private findRowByOffset(offsetY: number, grid: Grid): { row: number; within: number } {
    let y = 0;
    const totalRows = grid.rowMgr.getCount(); // Use getCount() method
    for (let r = 0; r < totalRows; r++) {
      const h = grid.rowMgr.getHeight(r);
      if (offsetY < y + h) return { row: r, within: offsetY - y };
      y += h;
    }
    return { row: totalRows > 0 ? totalRows - 1 : 0, within: 0 }; // Handle empty case
  }

  isHit(event: MouseEvent, grid: Grid): boolean {
    const { x: mouseX, y: mouseY } = this.getMouseCanvasPos(event, grid);
    const { y: viewY } = grid.getMousePos(event);

    if (mouseX < grid.rowHeaderWidth && mouseY >= HEADER_SIZE) {
      const dataAreaY = viewY - HEADER_SIZE;
      const { row, within } = this.findRowByOffset(dataAreaY, grid);
      if (row < 0) return false;
      if (within >= grid.rowMgr.getHeight(row) - RESIZE_GUTTER) {
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    const { y: viewY } = grid.getMousePos(event);
    const { row } = this.findRowByOffset(viewY - HEADER_SIZE, grid);

    this.resizingRow = row;
    this.dragStartY = event.clientY;
    this.originalSize = grid.rowMgr.getHeight(row);
    this.isResizing = true;

    const selectedRows = grid.selMgr.getSelectedRows();
    if (selectedRows.length > 1 && selectedRows.includes(row)) {
      const commands = selectedRows.map(
        (r) =>
          new ResizeRowCommand(
            grid,
            r,
            grid.rowMgr.getHeight(r),
            grid.rowMgr.getHeight(r)
          )
      );
      this.currentResizeCommand = new CompositeCommand(commands);
    } else {
      this.currentResizeCommand = new ResizeRowCommand(
        grid,
        this.resizingRow,
        this.originalSize,
        this.originalSize
      );
    }
    grid.canvas.style.cursor = 'row-resize';
    (grid.canvas as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    // For hover effects when not active
    if (!this.isResizing) {
      if (this.isHit(event, grid)) {
        grid.canvas.style.cursor = 'row-resize';
      }
    }
  }

  public updateCursor(event: MouseEvent, grid: Grid): boolean {
    if (this.isHit(event, grid)) {
      grid.canvas.style.cursor = 'row-resize';
      return true;
    }
    return false;
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isResizing || this.resizingRow === null || !this.currentResizeCommand) return;

    const dy = event.clientY - this.dragStartY;
    const newH = Math.max(20, this.originalSize + dy); // Ensure minimum height

    const selectedRows = grid.selMgr.getSelectedRows();
    if (
      selectedRows.length > 1 &&
      selectedRows.includes(this.resizingRow) &&
      this.currentResizeCommand instanceof CompositeCommand
    ) {
      for (let i = 0; i < selectedRows.length; i++) {
        const currentRow = selectedRows[i];
        grid.rowMgr.setHeight(currentRow, newH);
        const cmd = this.currentResizeCommand.commands[i];
        if (cmd instanceof ResizeRowCommand) { // Type guard
          cmd.updateNewSize(newH);
        }
      }
    } else if (this.currentResizeCommand instanceof ResizeRowCommand) { // Type guard
      grid.rowMgr.setHeight(this.resizingRow, newH);
      this.currentResizeCommand.updateNewSize(newH);
    }

    grid.updateEditorPosition(); // Method must be public on Grid
    grid.scheduleRender(); // Method must be public on Grid
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (this.isResizing && this.currentResizeCommand) {
      grid.commandManager.execute(this.currentResizeCommand); // commandManager must be public or have a public method
    }
    this.resizingRow = null;
    this.isResizing = false;
    this.currentResizeCommand = null;
    grid.canvas.style.cursor = 'cell'; // Reset cursor
    (grid.canvas as HTMLElement).releasePointerCapture(event.pointerId);
    grid.scheduleRender();
  }
}
