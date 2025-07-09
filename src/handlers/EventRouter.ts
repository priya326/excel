import type { Grid } from '../core/grid'; // Adjusted path
import type { IGridOperationHandler } from './IGridOperationHandler';

/**
 * EventRouter is responsible for dispatching pointer events to the appropriate handler.
 * On pointerdown, it determines which handler should become active based on its `isHit` method.
 * Subsequent pointermove, pointerdrag, and pointerup events are then routed to the active handler.
 */
export class EventRouter {
  private handlers: IGridOperationHandler[];
  private activeHandler: IGridOperationHandler | null = null;
  private grid: Grid;

  constructor(handlers: IGridOperationHandler[], grid: Grid) {
    this.handlers = handlers;
    this.grid = grid;
  }

  public onPointerDown(event: MouseEvent): void {
    // If there's an active handler, it might need to be reset or finalized
    // For now, we assume a new mousedown always tries to find a new handler.
    // More complex scenarios (e.g., handler wants to capture all subsequent events until explicitly released)
    // might require changes here or in the handlers themselves.
    this.activeHandler = null;

    for (const handler of this.handlers) {
      if (handler.isHit(event, this.grid)) {
        this.activeHandler = handler;
        this.activeHandler.onPointerDown(event, this.grid);
        // Optional: Set pointer capture if the handler requests it
        // (this.grid.canvas as HTMLElement).setPointerCapture(event.pointerId);
        break; // First handler that hits takes precedence
      }
    }
  }

  public onPointerMove(event: MouseEvent): void {
    if (this.activeHandler) {
      this.activeHandler.onPointerMove(event, this.grid);
    } else {
      // Optional: Preview hover effects from handlers even if none are active
      // For example, changing the cursor.
      let cursorSet = false;
      for (const handler of this.handlers) {
        // We'd need a dedicated hover/preview method on the interface for this
        // e.g., handler.onHover(event, this.grid)
        // For now, we can call isHit for cursor changes, but it's not ideal.
        if (typeof (handler as any).updateCursor === 'function') {
           if ((handler as any).updateCursor(event, this.grid)) {
             cursorSet = true;
             break;
           }
        }
      }
      if (!cursorSet) {
        // Default cursor if no handler sets one
        // this.grid.canvas.style.cursor = 'cell'; // Assuming grid.canvas exists
      }
    }
  }

  public onPointerDrag(event: MouseEvent): void {
    // This event is typically attached to `window` for dragging outside the canvas.
    if (this.activeHandler) {
      this.activeHandler.onPointerDrag(event, this.grid);
    }
  }

  public onPointerUp(event: MouseEvent): void {
    if (this.activeHandler) {
      this.activeHandler.onPointerUp(event, this.grid);
      // Optional: Release pointer capture
      // (this.grid.canvas as HTMLElement).releasePointerCapture(event.pointerId);
      this.activeHandler = null;
    }
  }

  // Helper to allow handlers to explicitly set the active handler, e.g., for chaining.
  public setActiveHandler(handler: IGridOperationHandler | null) {
    this.activeHandler = handler;
  }

  public getActiveHandler(): IGridOperationHandler | null {
    return this.activeHandler;
  }
}
