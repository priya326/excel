import type { EventHandler } from './EventHandler';

export class EventRouter {
  private handlers: EventHandler[];
  private activeHandler: EventHandler | null = null;

  constructor(handlers: EventHandler[]) {
    this.handlers = handlers;
  }

  onPointerDown(evt: MouseEvent) {
    const { x, y } = this.getEventPos(evt);
    const pointerType = (evt as PointerEvent).pointerType;
    for (const handler of this.handlers) {
      if (handler.hitTest(x, y, pointerType)) {
        this.activeHandler = handler;
        handler.onPointerDown(evt);
        return;
      }
    }
    this.activeHandler = null;
  }

  onPointerMove(evt: MouseEvent) {
    const { x, y } = this.getEventPos(evt);
    const pointerType = (evt as PointerEvent).pointerType;
    // For onPointerMove (hover effects), we typically don't set an activeHandler,
    // but allow multiple handlers to react if their hitTest passes (e.g., for cursor changes).
    // However, the current loop returns after the first hit.
    // For now, let's keep it simple and let the first handler that hits manage the pointer move.
    // A more complex system might collect all hit handlers and let them all process onPointerMove.
    for (const handler of this.handlers) {
      if (handler.hitTest(x, y, pointerType)) {
        handler.onPointerMove(evt);
        return; // Return after first handler processes move, consistent with previous logic
      }
    }
  }

  onPointerDrag(evt: MouseEvent) {
    if (this.activeHandler) {
      this.activeHandler.onPointerDrag(evt);
    }
  }

  onPointerUp(evt: MouseEvent) {
    if (this.activeHandler) {
      this.activeHandler.onPointerUp(evt);
      this.activeHandler = null;
    }
  }

  private getEventPos(evt: MouseEvent) {
    const rect = (evt.target as HTMLElement).getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    };
  }
} 