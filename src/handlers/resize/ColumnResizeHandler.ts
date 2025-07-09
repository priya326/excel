import { Grid } from '../../core/grid'; // Adjust path as necessary
import { IEventHandler } from '../IEventHandler';
import { ResizeColumnCommand } from '../../commands/ResizeColumnCommand'; // Adjust path
import { CompositeCommand } from '../../commands/CompositeCommand'; // Adjust path

// These constants would ideally be accessible from the Grid instance or a shared config
const HEADER_SIZE = 40;
const RESIZE_GUTTER = 5;

export class ColumnResizeHandler implements IEventHandler {
  private grid: Grid;
  private resizingCol: number | null = null;
  private dragStartX: number = 0;
  private originalSize: number = 0;
  private currentResizeCommand: ResizeColumnCommand | CompositeCommand | null = null;
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
    const { x: worldX } = grid.getMousePos(event); // worldX includes scroll

    if (mouseY < HEADER_SIZE && mouseX >= grid.rowHeaderWidth) { // grid.rowHeaderWidth instead of HEADER_SIZE for mouseX
      const { col, within } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth);
      if (within >= grid.colMgr.getWidth(col) - RESIZE_GUTTER) {
        return true;
      }
    }
    return false;
  }

  onPointerDown(event: MouseEvent, grid: Grid): void {
    if (!this.hitTest(event, grid)) return;

    const { x: worldX } = grid.getMousePos(event);
    const { col } = grid.findColumnByOffset(worldX - grid.rowHeaderWidth);

    this.resizingCol = col;
    this.dragStartX = event.clientX; // Use clientX for delta calculations
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
    grid.canvas.style.cursor = 'col-resize';
    // No need to draw resize line here, as onPointerDrag will handle visual feedback during drag
  }

  onPointerMove(event: MouseEvent, grid: Grid): void {
    // Update cursor based on hover even if not actively resizing
    if (this.hitTest(event, grid)) {
      grid.canvas.style.cursor = 'col-resize';
    } else if (!this.isResizing) {
      // Only reset cursor if this handler isn't actively resizing and not hitting another hotspot.
      // The EventRouter might need a more sophisticated way to manage default cursor state.
      // For now, if not hitting, this handler won't change the cursor.
      // A default cursor could be set by EventRouter if no handler sets one.
    }
  }

  onPointerDrag(event: MouseEvent, grid: Grid): void {
    if (!this.isResizing || this.resizingCol === null || !this.currentResizeCommand) {
      return;
    }

    const dx = event.clientX - this.dragStartX;
    const newW = Math.max(40, this.originalSize + dx); // Min column width 40

    const selectedCols = grid.selMgr.getSelectedColumns();
    if (
      selectedCols.length > 1 &&
      selectedCols.includes(this.resizingCol) &&
      this.currentResizeCommand instanceof CompositeCommand
    ) {
      for (let i = 0; i < selectedCols.length; i++) {
        const currentColToResize = selectedCols[i];
        grid.colMgr.setWidth(currentColToResize, newW);
        const cmd = this.currentResizeCommand.commands[i];
        if (cmd instanceof ResizeColumnCommand) { // Type guard
          cmd.updateNewSize(newW);
        }
      }
    } else if (this.currentResizeCommand instanceof ResizeColumnCommand) { // Single column resize
      grid.colMgr.setWidth(this.resizingCol, newW);
      this.currentResizeCommand.updateNewSize(newW);
    }

    grid.updateEditorPosition(); // If an editor is active
    grid.scheduleRender();
  }

  onPointerUp(event: MouseEvent, grid: Grid): void {
    if (this.isResizing && this.currentResizeCommand) {
      grid.commandManager.execute(this.currentResizeCommand);
    }
    this.resetState();
    // Cursor reset should ideally be handled by EventRouter or a default state.
    // grid.canvas.style.cursor = 'cell'; // Or whatever default is.
  }

  private resetState(): void {
    this.resizingCol = null;
    this.dragStartX = 0;
    this.originalSize = 0;
    this.currentResizeCommand = null;
    this.isResizing = false;
  }
}
