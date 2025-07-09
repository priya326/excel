// Define Grid as an importable type even if the full class is in a .js file for now
// This helps TypeScript understand the shape of the Grid object.
// We'll need to ensure Grid.ts exports the Grid class.
import { Grid } from '../core/grid'; // Adjust path as necessary

export interface IEventHandler {
  /**
   * Checks if this handler should activate for the given event.
   * This is called on pointerdown to determine the active handler,
   * and can also be called on pointermove for hover effects (e.g., changing cursor).
   * @param event The mouse event.
   * @param grid The grid instance.
   * @returns True if the handler should handle this event, false otherwise.
   */
  hitTest(event: MouseEvent, grid: Grid): boolean;

  /**
   * Handles the pointer down event.
   * Called by the EventRouter when this handler is deemed active after a successful hitTest.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerDown(event: MouseEvent, grid: Grid): void;

  /**
   * Handles the pointer move event.
   * This can be called in two contexts:
   * 1. When this handler is the activeHandler (mouse button is down and dragging).
   * 2. For all handlers to update things like cursors based on hover, even if not active.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerMove(event: MouseEvent, grid: Grid): void;

  /**
   * Handles the pointer drag event (mouse move while button is pressed).
   * Called by the EventRouter when this handler is the activeHandler.
   * Typically, this event is listened to on the `window` to capture drags outside the canvas.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerDrag(event: MouseEvent, grid: Grid): void;

  /**
   * Handles the pointer up event.
   * Called by the EventRouter when this handler is the activeHandler.
   * Typically, this event is listened to on the `window`.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerUp(event: MouseEvent, grid: Grid): void;
}
