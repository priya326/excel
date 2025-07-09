import type { Grid } from '../core/grid'; // Adjusted path

/**
 * Interface for all grid operation handlers.
 * Each handler is responsible for a specific interaction type on the grid.
 */
export interface IGridOperationHandler {
  /**
   * Checks if the current mouse event (usually on mousedown)
   * should activate this handler.
   * @param event The mouse event.
   * @param grid The grid instance.
   * @returns True if this handler should take control, false otherwise.
   */
  isHit(event: MouseEvent, grid: Grid): boolean;

  /**
   * Called when a pointerdown event occurs and this handler is active.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerDown(event: MouseEvent, grid: Grid): void;

  /**
   * Called when a pointermove event occurs on the canvas
   * and this handler is active.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerMove(event: MouseEvent, grid: Grid): void;

  /**
   * Called when a pointermove event occurs (potentially outside the canvas, e.g., on window)
   * while this handler is active, typically for dragging operations.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerDrag(event: MouseEvent, grid: Grid): void;

  /**
   * Called when a pointerup event occurs (potentially outside the canvas, e.g., on window)
   * and this handler is active.
   * @param event The mouse event.
   * @param grid The grid instance.
   */
  onPointerUp(event: MouseEvent, grid: Grid): void;
}
