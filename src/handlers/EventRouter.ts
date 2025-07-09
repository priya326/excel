import { Grid } from '../core/grid'; // Assuming Grid is exported from grid.ts
import { IEventHandler } from './IEventHandler';

export class EventRouter {
  private handlers: IEventHandler[];
  private activeHandler: IEventHandler | null = null;
  private grid: Grid;

  constructor(handlers: IEventHandler[], grid: Grid) {
    this.handlers = handlers;
    this.grid = grid;
  }

  public onPointerDown(event: MouseEvent): void {
    for (const handler of this.handlers) {
      if (handler.hitTest(event, this.grid)) {
        this.activeHandler = handler;
        this.activeHandler.onPointerDown(event, this.grid);
        // Prevent other handlers from processing this event once one is active
        // Also, this can prevent default browser actions if necessary (e.g., text selection on drag)
        event.preventDefault();
        return;
      }
    }
    // If no handler claims the event, reset activeHandler (though it should be null already)
    this.activeHandler = null;
  }

  public onPointerMove(event: MouseEvent): void {
    // If a handler is active (i.e., mouse button is down and dragging started on a hotspot),
    // let it handle the move.
    if (this.activeHandler) {
      // This is a deviation from the plan: onPointerMove for active handler is typically for drag.
      // The main `onPointerDrag` (bound to window) is better for actual dragging.
      // However, if a handler needs to react to mouse movement *within the canvas bounds* while active,
      // this could be used. For now, let's stick to the idea that activeHandler.onPointerDrag handles dragging.
      // this.activeHandler.onPointerMove(event, this.grid);
    } else {
      // If no handler is active, iterate through all handlers to allow them
      // to react to hover events (e.g., changing the cursor).
      let cursorSet = false;
      for (const handler of this.handlers) {
        // Pass the event to onPointerMove for hover effects.
        // The handler's onPointerMove should check hitTest itself if it only wants to act on hover over its specific area.
        // Alternatively, we could call hitTest here first:
        if (handler.hitTest(event, this.grid)) {
            handler.onPointerMove(event, this.grid); // For cursor changes primarily
            cursorSet = true; // Assume handler sets the cursor
            // break; // Optional: break if one handler sets the cursor and others shouldn't override
        }
      }
      if (!cursorSet && this.grid.canvas) {
        // Default cursor if no handler sets one during hover
        // this.grid.canvas.style.cursor = 'default'; // Or 'cell' or whatever is appropriate
      }
    }
  }

  public onPointerDrag(event: MouseEvent): void {
    // This method is intended to be called for mousemove events on the *window*
    // when a pointer button is down (i.e., an operation is active).
    if (this.activeHandler) {
      this.activeHandler.onPointerDrag(event, this.grid);
      event.preventDefault();
    }
  }

  public onPointerUp(event: MouseEvent): void {
    // This method is intended to be called for mouseup events on the *window*.
    if (this.activeHandler) {
      this.activeHandler.onPointerUp(event, this.grid);
      this.activeHandler = null;
      event.preventDefault();
    }
  }

  // Helper to get the grid instance if needed by external callers, though handlers get it passed.
  public getGrid(): Grid {
    return this.grid;
  }

  // Optional: A method to explicitly set/change cursor if managed centrally by EventRouter
  public updateCursor(cursorStyle: string): void {
    if (this.grid.canvas) {
      this.grid.canvas.style.cursor = cursorStyle;
    }
  }
}
