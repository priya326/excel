import type { EventHandler } from '../EventHandler';
import type { Grid } from '../../core/grid';

const HEADER_SIZE = 40; // Assuming this is consistent with grid.ts

export class SelectAllHandler implements EventHandler {
  private grid: Grid;
  private isHovering: boolean = false;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  hitTest(x: number, y: number): boolean {
    // Check if the pointer is within the top-left box
    const currentGridRowHeaderWidth = this.grid.getRowHeaderWidth();
    return x >= 0 && x < currentGridRowHeaderWidth && y >= 0 && y < HEADER_SIZE;
  }

  onPointerDown(evt: MouseEvent): void {
    if (this.hitTest(evt.offsetX, evt.offsetY)) {
      this.grid['selMgr'].selectAll();
      this.grid['scheduleRender'](); // Ensure grid re-renders with new selection
      // Potentially update stats and toolbar if select all has specific behavior for them
      if (typeof this.grid['computeSelectionStats'] === 'function') {
        this.grid['computeSelectionStats']();
      }
      if (typeof this.grid['updateToolbarState'] === 'function') {
        this.grid['updateToolbarState']();
      }
    }
  }

  onPointerMove(evt: MouseEvent): void {
    const rect = (evt.target as HTMLElement).getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    const currentlyHit = this.hitTest(x,y);

    if (currentlyHit) {
        this.grid['canvas'].style.cursor = 'default'; // Or a specific select-all cursor
        if (!this.isHovering) {
            this.isHovering = true;
            (this.grid as any)['_isTopLeftHovered'] = true; // Communicate hover state to grid for rendering
            this.grid['scheduleRender']();
        }
    } else {
        if (this.isHovering) {
            this.isHovering = false;
            (this.grid as any)['_isTopLeftHovered'] = false;
            this.grid['scheduleRender']();
        }
    }
  }

  onPointerDrag(evt: MouseEvent): void {
    // No drag action for select all
  }

  onPointerUp(evt: MouseEvent): void {
    // No specific action on pointer up, selection happens on down
  }
}
