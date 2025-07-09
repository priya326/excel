import { Grid } from '../../core/grid'; // Adjust path as necessary
import { IEventHandler } from '../IEventHandler';
import { ResizeRowCommand } from '../../commands/ResizeRowCommand'; // Adjust path
import { CompositeCommand } from '../../commands/CompositeCommand'; // Adjust path

// These constants would ideally be accessible from the Grid instance or a shared config
const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5;

export class RowResizeHandler implements IEventHandler {
  private grid: Grid;
  private resizingRow: number | null = null;
  private dragStartY: number = 0;
  private originalSize: number = 0;
  private currentResizeCommand: ResizeRowCommand | CompositeCommand | null = null;
  private isResizing: boolean = false; // Tracks if a resize operation is active

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
    const { y: worldY } = grid.getMousePos(event); // worldY includes scroll

    if (mouseX < grid.rowHeaderWidth && mouseY >= HEADER_SIZE) { // Use grid.rowHeaderWidth
      const { row, within } = grid.findRowByOffset(worldY - HEADER_SIZE);
      if (within >= grid.rowMgr.getHeight(row) - RESIZE_GUTTER) {
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (!this.hitTest(event, grid)) return;

    const { y: worldY } = grid.getMousePos(event);
    const { row } = grid.findRowByOffset(worldY - HEADER_SIZE);

    this.resizingRow = row;
    this.dragStartY = event.clientY; // Use clientY for delta calculations
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
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    if (this.hitTest(event, grid)) {
      grid.canvas.style.cursor = 'row-resize';
    }
    // Default cursor management would be handled by EventRouter or a final else block here
    // if this handler isn't also active.
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isResizing || this.resizingRow === null || !this.currentResizeCommand) {
      return;
    }

    const dy = event.clientY - this.dragStartY;
    const newH = Math.max(20, this.originalSize + dy); // Min row height 20

    const selectedRows = grid.selMgr.getSelectedRows();
    if (
      selectedRows.length > 1 &&
      selectedRows.includes(this.resizingRow) &&
      this.currentResizeCommand instanceof CompositeCommand
    ) {
      for (let i = 0; i < selectedRows.length; i++) {
        const currentRowToResize = selectedRows[i];
        grid.rowMgr.setHeight(currentRowToResize, newH);
        const cmd = this.currentResizeCommand.commands[i];
        if (cmd instanceof ResizeRowCommand) { // Type guard
          cmd.updateNewSize(newH);
        }
      }
    } else if (this.currentResizeCommand instanceof ResizeRowCommand) { // Single row resize
      grid.rowMgr.setHeight(this.resizingRow, newH);
      this.currentResizeCommand.updateNewSize(newH);
    }

    grid.updateEditorPosition(); // If an editor is active
    grid.scheduleRender();
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (this.isResizing && this.currentResizeCommand) {
      grid.commandManager.execute(this.currentResizeCommand);
    }
    this.resetState();
    // grid.canvas.style.cursor = 'cell'; // Reset cursor
  }

  private resetState(): void {
    this.resizingRow = null;
    this.dragStartY = 0;
    this.originalSize = 0;
    this.currentResizeCommand = null;
    this.isResizing = false;
  }
}
