// imports
import { Cell } from "./cell";
import { RowManager } from "./RowManager";
import { ColumnManager } from "./ColumnManager";
import { SelectionManager } from "./Selection";
import { CommandManager } from "../commands/CommandManager";
import { EditCellCommand } from "../commands/EditCellCommand";
import { ResizeColumnCommand } from "../commands/ResizeColumnCommand";
import { ResizeRowCommand } from "../commands/ResizeRowCommand";
import { FontSizeCommand } from "../commands/FontSizeCommand";
import { BoldCommand } from "../commands/BoldCommand";
import { ItalicCommand } from "../commands/ItalicCommand";
import { Aggregator } from "./Aggregator";
import { evaluateFormula } from "../formulas/FormulaEvaluator";
import { getCoordinates } from "../utils/CellRange";
import { PasteCommand } from "../commands/PasteCommand";
import { CompositeCommand } from "../commands/CompositeCommand";
import { ClipboardManager } from "../commands/ClipboardManager";
import { AlignmentCommand } from "../commands/AlignmentCommand";
import { InsertRowCommand } from "../commands/InsertRowCommand";
import { DeleteRowCommand } from "../commands/DeleteRowCommand";
import { InsertColumnCommand } from "../commands/InsertColumnCommand";
import { DeleteColumnCommand } from "../commands/DeleteColumnCommand";
// New Handler Imports
import { EventRouter } from '../handlers/EventRouter';
import { ColumnResizeHandler } from '../handlers/resize/ColumnResizeHandler';
import { RowResizeHandler } from '../handlers/resize/RowResizeHandler';
import { ColumnHeaderDragHandler } from '../handlers/drag/ColumnHeaderDragHandler'; // Corrected import
import { RowHeaderDragHandler } from '../handlers/drag/RowHeaderDragHandler'; // Corrected import
import { CellSelectionHandler } from '../handlers/select/CellSelectionHandler'; // Corrected import
// Note: RowSelectHandler and HeaderDragHandler (generic) might be covered by the new specific handlers or need separate implementation if their logic is distinct.
// For now, focusing on the five handlers created.


/**
 * Default sizes used by managers on first construction.
 */
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 30;

export const ROWS = 100_500;
export const COLS = 5001;

/** How many extra rows / columns to draw outside the viewport */
const RENDER_BUFFER_PX = 200;

/** Size of the header band (row numbers / column letters) */
const HEADER_SIZE = 40;

/** How many pixels near an edge counts as a "resize hotspot" */
const RESIZE_GUTTER = 5;
let dpr = window.devicePixelRatio || 1;
/**
 * @class Grid
 * @classdesc Manages rendering, selection, editing, and resizing of a spreadsheet-like canvas grid.
 * Supports virtual scrolling, cell editing, selection, and data import.
 */
export class Grid {
  /** @type {HTMLCanvasElement} The canvas element for rendering the grid. */
  public readonly canvas: HTMLCanvasElement; // Made public
  /** @type {CanvasRenderingContext2D} The 2D rendering context for the canvas. */
  public readonly ctx: CanvasRenderingContext2D; // Made public
  /** @type {RowManager} Manages row heights and operations. */
  public readonly rowMgr: RowManager;
  /** @type {ColumnManager} Manages column widths and operations. */
  public readonly colMgr: ColumnManager;
  /** @type {SelectionManager} Manages selection state and drawing. */
  public readonly selMgr: SelectionManager; // Made public
  /**@type {number} Specifies the width of the row Header that changes based on the label */
  public rowHeaderWidth: number = 40; // Made public
  /** @type {Map} cells which are map of maps  */
  public cells: Map<number, Map<number, Cell>> = new Map();
  /** @type {HTMLInputElement|null} The input element for cell editing. */
  private editorInput: HTMLInputElement | null = null; // Keep private, managed by start/finishEditing
  /** @type {{row: number, col: number}|null} The currently editing cell. */
  private editingCell: { row: number; col: number } | null = null; // Keep private, managed by start/finishEditing
  /** @type {HTMLElement} The scrollable container for the grid. */
  public container: HTMLElement; // Made public
  /** @type {boolean} Suppresses rendering during batch updates. */
  private suppressRender: boolean = false;
  /** @type {boolean} Whether a render is scheduled. */
  private renderScheduled: boolean = false;

  // ---- State properties moved to individual handlers ----
  // private isMouseDown: boolean = false;
  // private isColHeaderDrag: boolean = false;
  // private dragStartCell: { row: number; col: number } | null = null;
  // private dragStartColHeader: number | null = null;
  // private dragStartMouse: { x: number; y: number } | null = null;
  // private resizingRow: number | null = null;
  // private dragStartX: number = 0;
  // private dragStartY: number = 0;
  // private originalSize: number = 0;
  // private currentResizeCommand: any = null; // Specific resize commands are in handlers
  // private isResizing: boolean = false;
  // private resizingCol: number | null = null;
  // private _colHeaderDragHasDragged: boolean = false;
  // private isRowHeaderDrag: boolean = false;
  // private dragStartRowHeader: number | null = null;
  // private _rowHeaderDragHasDragged: boolean = false;
  // ---- End of moved state properties ----

  public commandManager: CommandManager = new CommandManager(); // Made public

  /** @type {number} the offest used in marching ants */
  private dashOffset: number = 0;
  /** @type {{startRow:number, startCol: number, endRow: number, endCol: number}|null} hold the range of data for whose calculations are to be made*/
  private formulaRange: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null = null;
  /** @type {number|null} id of the animation returned by requestAnimationFrame */
  private animationId: number | null = null;
  /** @type {Cell|null} saves the current cell which is being edited */
  private editingCellInstance: Cell | null = null; // Keep private

  // Track hover state for top-left box
  /** @type {boolean} Whether the top-left box is hovered. */
  private _isTopLeftHovered: boolean = false; // Keep private, managed by Grid.render and EventRouter potentially

  /** @type {string[][]|null} The clipboard data. */
  private clipboard: string[][] | null = null; // Keep private, managed by copy/paste logic

  /** @type {number|null} The column selection anchor. */
  public columnSelectionAnchor: number | null = null; // Made public for handlers
  /** @type {number|null} The column selection focus. */
  public columnSelectionFocus: number | null = null; // Made public for handlers

  /** @type {number|null} The row selection anchor. */
  public rowSelectionAnchor: number | null = null; // Made public for handlers
  /** @type {number|null} The row selection focus. */
  public rowSelectionFocus: number | null = null; // Made public for handlers

  /** @type {number} The last render time. */
  private _lastRenderTime: number = 0; // Keep private

  // Add this property to the class:
  /** @type {{row: number, col: number}|null} The pending edit cell. */
  public pendingEditCell: { row: number; col: number } | null = null; // Made public for handlers

  private eventRouter: EventRouter;
  // Instances of new handlers will be created in constructor
  // private columnResizeHandler: ColumnResizeHandler; // Old, to be replaced
  // private rowResizeHandler: RowResizeHandler; // Old, to be replaced
  // private headerDragHandler: HeaderDragHandler; // Old, to be replaced
  // private rowSelectHandler: RowSelectHandler; // Old, to be replaced
  // private cellSelectHandler: CellSelectHandler; // Old, to be replaced

  /* ─────────────────────────────────────────────────────────────────── */
  /**
   * Initializes the Grid.
   * @param {HTMLCanvasElement} canvas The canvas element to render on.
   */
  constructor(canvas: HTMLCanvasElement) {
    /* Canvas / context */
    this.canvas = canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not supported");
    this.ctx = ctx;

    this.container = document.getElementById("canvas-container")!;

    const rect = this.canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const fakeScrollDiv = document.createElement("div");
    fakeScrollDiv.style.height = ROWS * DEFAULT_ROW_HEIGHT + "px";
    fakeScrollDiv.style.width = COLS * DEFAULT_COL_WIDTH + "px";
    this.container.appendChild(fakeScrollDiv);

    const filler = document.getElementById("scroll-filler")!;

    this.container.addEventListener("scroll", () => {
      this.updateEditorPosition();
      this.scheduleRender();
    });
    window.addEventListener("resize", () => {
      this.updateEditorPosition();
      this.resizeCanvas();
    });

    this.rowMgr = new RowManager(ROWS, DEFAULT_ROW_HEIGHT);
    this.colMgr = new ColumnManager(COLS, DEFAULT_COL_WIDTH);
    this.selMgr = new SelectionManager(); // Already public due to previous change
    const virtualHeight = this.rowMgr.getTotalHeight();
    const virtualWidth = this.colMgr.getTotalWidth();
    filler.style.height = virtualHeight + "px";
    filler.style.width = virtualWidth + "px";
    this.canvas.style.cursor = "cell"; // Default cursor

    // Instantiate new handlers
    const colResizeHandler = new ColumnResizeHandler();
    const rowResizeHandler = new RowResizeHandler();
    const colHeaderDragHandler = new ColumnHeaderDragHandler();
    const rowHeaderDragHandler = new RowHeaderDragHandler();
    const cellSelectionHandler = new CellSelectionHandler();
    // TODO: Instantiate other handlers like a top-left select-all handler if needed.

    this.eventRouter = new EventRouter([
      colResizeHandler,
      rowResizeHandler,
      colHeaderDragHandler,
      rowHeaderDragHandler,
      cellSelectionHandler,
      // Add other handlers here
    ], this); // Pass grid instance to EventRouter

    this.addEventListeners();
    this.resizeCanvas();
    // Log the number of created cells at startup
    // console.log("Cells created at startup:", this.countCreatedCells());

    // Clean up animation when window loses focus
    window.addEventListener("blur", () => {
      this.stopMarchingAntsAnimation();
    });
  }

  private resizeCanvas(): void {
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    dpr = window.devicePixelRatio
    this.scheduleRender();
  }

  public scheduleRender(): void { // Made public
    if (this.renderScheduled || this.suppressRender) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.render();
      this.renderScheduled = false;
    });
  }

  /**
   * Initializes the cell storage for the grid.
   */

  /**
   * Gets the cell object at the specified row and column, or null if it doesn't exist.
   * @param {number} row The row index.
   * @param {number} col The column index.
   * @returns {Cell|null} The cell object or null if not present.
   */
  private getCellIfExists(row: number, col: number): Cell | null {
    const rowMap = this.cells.get(row);
    if (!rowMap) return null;
    return rowMap.get(col) || null;
  }

  /**
   * Gets the value of the cell at the specified row and column, or an empty string if it doesn't exist.
   * @param {number} row The row index.
   * @param {number} col The column index.
   * @returns {string} The cell value or empty string if not present.
   */
  private getCellValueIfExists(row: number, col: number): string {
    const rowMap = this.cells.get(row);
    if (!rowMap) return "";
    const cell = rowMap.get(col);
    return cell ? cell.getValue() : "";
  }

  /**
   * Adds all event listeners for mouse and keyboard interaction.
   */
  private addEventListeners(): void {
    // Use pointer events for unified input
    this.canvas.addEventListener('pointerdown', (evt) => this.eventRouter.onPointerDown(evt as unknown as MouseEvent));
    this.canvas.addEventListener('pointermove', (evt) => this.eventRouter.onPointerMove(evt as unknown as MouseEvent));
    window.addEventListener('pointermove', (evt) => this.eventRouter.onPointerDrag(evt as unknown as MouseEvent));
    window.addEventListener('pointerup', (evt) => this.eventRouter.onPointerUp(evt as unknown as MouseEvent));
    window.addEventListener("keydown", this.onKeyDown.bind(this));
    const undoButton = document.getElementById("undoBtn")!;
    undoButton.addEventListener("click", this.onUndo.bind(this));
    const redoButton = document.getElementById("redoBtn")!;
    redoButton.addEventListener("click", this.onRedo.bind(this));
    this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this))

    // Search functionality
    const searchInput = document.getElementById(
      "searchInput"
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener("input", () =>
        this.searchCell(searchInput.value)
      );
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.navigateSearchResults("next");
        } else if (e.key === "Escape") {
          searchInput.value = "";
          this.clearSearch();
          searchInput.blur();
        }
      });
    }

    // Toolbar buttons
    const insertRowBtn = document.getElementById("insertRowBtn")!;
    insertRowBtn.addEventListener("click", this.onInsertRow.bind(this));
    const insertColBtn = document.getElementById("insertColBtn")!;
    insertColBtn.addEventListener("click", this.onInsertColumn.bind(this));
    const deleteRowBtn = document.getElementById("deleteRowBtn")!;
    deleteRowBtn.addEventListener("click", this.onDeleteRow.bind(this));
    const deleteColBtn = document.getElementById("deleteColBtn")!;
    deleteColBtn.addEventListener("click", this.onDeleteColumn.bind(this));

    // Font controls
    const fontSizeSelect = document.getElementById(
      "fontSizeSelect"
    ) as HTMLSelectElement;
    fontSizeSelect.addEventListener("change", this.onFontSizeChange.bind(this));
    const boldBtn = document.getElementById("boldBtn")!;
    boldBtn.addEventListener("click", this.onBoldToggle.bind(this));
    const italicBtn = document.getElementById("italicBtn")!;
    italicBtn.addEventListener("click", this.onItalicToggle.bind(this));

    const alignLeftBtn = document.getElementById("alignLeftBtn");
    if (alignLeftBtn)
      alignLeftBtn.addEventListener("click", () =>
        this.applyAlignmentToSelection("left")
      );
    const alignCenterBtn = document.getElementById("alignCenterBtn");
    if (alignCenterBtn)
      alignCenterBtn.addEventListener("click", () =>
        this.applyAlignmentToSelection("center")
      );
    const alignRightBtn = document.getElementById("alignRightBtn");
    if (alignRightBtn)
      alignRightBtn.addEventListener("click", () =>
        this.applyAlignmentToSelection("right")
      );
  }


  /**
   * Undo event handler
   */
  private onUndo(): void {
    this.commandManager.undo();
    this.scheduleRender();
  }

  /**
   * Redo event handler
   */
  private onRedo(): void {
    this.commandManager.redo();
    this.scheduleRender();
  }

  /**
   * Insert row event handler
   */
  private onInsertRow(): void {
    this.rowSelectionAnchor = null;
    this.rowSelectionFocus = null;
    const selectedRow = this.selMgr.getSelectedRow();
    const selectedCell = this.selMgr.getSelectedCell();
    const insertAt =
      selectedRow !== null ? selectedRow : selectedCell ? selectedCell.row : 0;

    // Use command for undo/redo
    const command = new InsertRowCommand(this, insertAt);
    this.commandManager.execute(command);
    this.scheduleRender();
  }

  /**
   * Insert column event handler
   */
  private onInsertColumn(): void {
    this.columnSelectionAnchor = null;
    this.columnSelectionFocus = null;
    const selectedCol = this.selMgr.getSelectedCol();
    const selectedCell = this.selMgr.getSelectedCell();
    const insertAt =
      selectedCol !== null ? selectedCol : selectedCell ? selectedCell.col : 0;

    // Use command for undo/redo
    const command = new InsertColumnCommand(this, insertAt);
    this.commandManager.execute(command);
    this.scheduleRender();
  }

  /**
   * Delete row event handler
   */
  private onDeleteRow(): void {
    const selectedRow = this.selMgr.getSelectedRow();
    this.rowSelectionAnchor = null;
    this.rowSelectionFocus = null;
    // Only delete if a row is specifically selected
    if (selectedRow === null) {
      return;
    }

    // Ask for confirmation
    const confirmed = confirm(
      `Are you sure you want to delete row ${selectedRow + 1}?`
    );
    if (!confirmed) {
      return;
    }

    if (selectedRow >= 0 && selectedRow < ROWS) {
      // Use command for undo/redo
      const command = new DeleteRowCommand(this, selectedRow);
      this.commandManager.execute(command);
      // Clear selection
      this.selMgr.clearSelection();
      this.scheduleRender();
    }
  }

  /**
   * Delete column event handler
   */
  private onDeleteColumn(): void {
    this.columnSelectionAnchor = null;
    this.columnSelectionFocus = null;
    const selectedCol = this.selMgr.getSelectedCol();
    const selectedCell = this.selMgr.getSelectedCell();
    if (selectedCol === null) {
      return;
    }
    const deleteAt =
      selectedCol !== null ? selectedCol : selectedCell ? selectedCell.col : 0;
    const confirmed = confirm(
      `Are you sure you want to delete column ${deleteAt + 1}?`
    );
    if (!confirmed) {
      return;
    }
    if (deleteAt >= 0 && deleteAt < COLS) {
      // Use command for undo/redo
      const command = new DeleteColumnCommand(this, deleteAt);
      this.commandManager.execute(command);
      // Clear selection
      this.selMgr.clearSelection();
      this.scheduleRender();
    }
  }

  /**
   * Shift cells down
   * @param insertAt - The row to insert at
   */
  public shiftCellsDown(insertAt: number): void {
    // Move all cells from insertAt onwards down by one row
    for (let row = ROWS - 2; row >= insertAt; row--) {
      const rowMap = this.cells.get(row);
      if (rowMap) {
        const newRowMap = new Map();
        for (const [col, cell] of rowMap) {
          const newCell = new Cell(row + 1, col);
          newCell.setValue(cell.getValue());
          newRowMap.set(col, newCell);
        }
        this.cells.set(row + 1, newRowMap);
      }
    }
    // Clear the inserted row (make it empty, don't delete)
    this.cells.set(insertAt, new Map());
  }

  /**
   * Shift cells right
   * @param insertAt - The column to insert at
   */
  public shiftCellsRight(insertAt: number): void {
    // Only process rows that have data
    for (const rowMap of this.cells.values()) {

      const cols = Array.from(rowMap.keys()).filter((col) => col >= insertAt);
      cols.sort((a, b) => b - a);
      for (const col of cols) {
        const cell = rowMap.get(col)!;
        rowMap.set(col + 1, new Cell(cell.row, col + 1));
        rowMap.get(col + 1)!.setValue(cell.getValue());
        rowMap.delete(col);
      }
    }
  }

  /**
   * Shift cells up
   * @param deleteAt - The row to delete at
   */
  public shiftCellsUp(deleteAt: number): void {
    // Move all cells from deleteAt + 1 onwards up by one row
    for (let row = deleteAt; row < ROWS - 1; row++) {
      const rowMap = this.cells.get(row + 1);
      if (rowMap) {
        const newRowMap = new Map();
        for (const [col, cell] of rowMap) {
          const newCell = new Cell(row, col);
          newCell.setValue(cell.getValue());
          newRowMap.set(col, newCell);
        }
        this.cells.set(row, newRowMap);
      } else {
        this.cells.delete(row);
      }
    }
    // Clear the last row
    this.cells.delete(ROWS - 1);
  }

  /**
   * Shift cells left
   * @param deleteAt - The column to delete at
   */
  public shiftCellsLeft(deleteAt: number): void {
    for (const rowMap of this.cells.values()) {
      // Remove the deleted column first
      rowMap.delete(deleteAt);
      // Find all columns in this row that need to be shifted
      const cols = Array.from(rowMap.keys()).filter((col) => col > deleteAt);
      // Sort ascending so we don't overwrite
      cols.sort((a, b) => a - b);
      for (const col of cols) {
        const cell = rowMap.get(col)!;
        rowMap.set(col - 1, new Cell(cell.row, col - 1));
        rowMap.get(col - 1)!.setValue(cell.getValue());
        rowMap.delete(col);
      }
    }
  }

  /**
   * Mouse down event handler - Now largely delegated to EventRouter
   * @param evt - The mouse event (though not directly used anymore by this method)
   */
  private onMouseDown(evt: MouseEvent): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    // All substantive logic has been moved to individual handlers via EventRouter.
    // This method is kept for now in case other parts of the system might call it,
    // or if a very generic mousedown action (not tied to a specific operation) is needed.
    // For pointer events, EventRouter.onPointerDown is the entry point.
    // console.log("Grid.onMouseDown called - should be handled by EventRouter");
  }

  /**
   * Double click event handler
   * @param evt - The mouse event
   */
  public onDoubleClick(evt: MouseEvent): void { // Made public
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = evt.clientX - rect.left;
    const mouseY = evt.clientY - rect.top;
    // Ensure click is not on headers for cell editing
    if (mouseX < this.rowHeaderWidth || mouseY < HEADER_SIZE) return;

    const { x, y } = this.getMousePos(evt);
    const { col } = this.findColumnByOffset(x - this.rowHeaderWidth);
    const { row } = this.findRowByOffset(y - HEADER_SIZE);

    this.pendingEditCell = { row, col };
    this.startEditingCell(row, col);
  }

  /**
   * Mouse move event handler - Now largely delegated to EventRouter
   * @param evt - The mouse event (though not directly used anymore by this method)
   */
  private onMouseMove(evt: MouseEvent): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    // All substantive logic has been moved to individual handlers via EventRouter.
    // Hover effects (like cursor changes) are handled by EventRouter delegating to
    // individual handlers' `updateCursor` or similar methods.
    // console.log("Grid.onMouseMove called - should be handled by EventRouter");
  }



  /**
   * Mouse drag event handler - Now largely delegated to EventRouter
   * @param evt - The mouse event (though not directly used anymore by this method)
   */
  private onMouseDrag(evt: MouseEvent): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    // All substantive logic has been moved to individual handlers via EventRouter.
    // Dragging operations are handled by the active handler's `onPointerDrag`.
    // console.log("Grid.onMouseDrag called - should be handled by EventRouter");
  }

  /**
   * Mouse up event handler - Now largely delegated to EventRouter
   */
  private onMouseUp(): void {
    // All substantive logic has been moved to individual handlers via EventRouter.
    // The active handler's `onPointerUp` is called by the EventRouter.
    // console.log("Grid.onMouseUp called - should be handled by EventRouter");
  }
  /**
   * Key down event handler
   * @param e - The keyboard event
   */
  private onKeyDown(e: KeyboardEvent): void {
    // Prevent grid key handling if an input, textarea, or contenteditable is focused
    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.getAttribute("contenteditable") === "true")
    ) {
      return;
    }
    // Only handle navigation if not editing a cell
    if (e.ctrlKey && e.key === "c") {
      // Copy selected cells to clipboard (even if empty)
      const dragRect = this.selMgr.getDragRect && this.selMgr.getDragRect();
      if (dragRect) {
        this.copyRange = {
          startRow: dragRect.startRow,
          startCol: dragRect.startCol,
          endRow: dragRect.endRow,
          endCol: dragRect.endCol,
        };
        this.startMarchingAntsAnimation();
        const clipboardData: string[][] = [];
        for (let r = dragRect.startRow; r <= dragRect.endRow; r++) {
          const row: string[] = [];
          for (let c = dragRect.startCol; c <= dragRect.endCol; c++) {
            const cell = this.getCellIfExists(r, c);
            row.push(cell ? cell.getValue() : "");
          }
          clipboardData.push(row);
        }
        this.clipboard = clipboardData;
        this.formulaRange = null;
      } else {
        const selectedCells = this.getSelectedCells();
        if (selectedCells.length > 0) {
          const minRow = Math.min(...selectedCells.map((cell) => cell.row));
          const minCol = Math.min(...selectedCells.map((cell) => cell.col));
          const maxRow = Math.max(...selectedCells.map((cell) => cell.row));
          const maxCol = Math.max(...selectedCells.map((cell) => cell.col));
          this.copyRange = {
            startRow: minRow,
            startCol: minCol,
            endRow: maxRow,
            endCol: maxCol,
          };
          this.startMarchingAntsAnimation();
          const clipboardData: string[][] = [];
          for (let r = minRow; r <= maxRow; r++) {
            const row: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
              const cell = this.getCellIfExists(r, c);
              row.push(cell ? cell.getValue() : "");
            }
            clipboardData.push(row);
          }
          this.clipboard = clipboardData;
          this.formulaRange = null;
        }
      }
      this.scheduleRender();
      return;
    }
    if (e.ctrlKey && e.key === "v") {
      // Paste clipboard at selected cell
      const selectedCell = this.selMgr.getSelectedCell();
      if (!selectedCell || !this.clipboard) return;
      const { row, col } = selectedCell;
      // Use ClipboardManager for undo/redo support
      const clipboardManager = new ClipboardManager();
      clipboardManager.setData(this.clipboard);
      const command = new PasteCommand(row, col, this, clipboardManager);
      this.commandManager.execute(command);
      // Show blue marching ants for paste
      // this.pasteRange = {
      //   startRow: row,
      //   startCol: col,
      //   endRow: row + this.clipboard.length - 1,
      //   endCol: col + (this.clipboard[0]?.length || 1) - 1
      // };
      this.copyRange = null; // Clear copy ants
      this.formulaRange = null;
      this.startMarchingAntsAnimation();
      this.scheduleRender();
      return;
    }
    if (
      e.ctrlKey &&
      e.shiftKey &&
      (e.key === "ArrowDown" || e.key === "ArrowUp")
    ) {
      const selected = this.selMgr.getSelectedCell();
      if (!selected) return;
      const { row, col } = selected;
      let targetRow = row;
      if (e.key === "ArrowDown") {
        for (let r = row + 1; r < ROWS; r++) {
          if (this.getCellValueIfExists(r, col) !== "") {
            targetRow = r;
            break;
          }
        }
        if (targetRow === row) targetRow = ROWS - 1; // No data found, go to last row
      } else if (e.key === "ArrowUp") {
        for (let r = row - 1; r >= 0; r--) {
          if (this.getCellValueIfExists(r, col) !== "") {
            targetRow = r;
            break;
          }
        }
        if (targetRow === row) targetRow = 0; // No data found, go to first row
      }
      this.selMgr.clearSelection();
      this.selMgr.selectCell(targetRow, col);
      this.scrollToCell(targetRow, col);
      this.scheduleRender();
      return;
    }
    if (
      e.ctrlKey &&
      e.shiftKey &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight")
    ) {
      const selected = this.selMgr.getSelectedCell();
      if (!selected) return;
      const { row, col } = selected;
      let targetCol = col;
      if (e.key === "ArrowRight") {
        for (let c = col + 1; c < COLS; c++) {
          if (this.getCellValueIfExists(row, c) !== "") {
            targetCol = c;
            break;
          }
        }
        if (targetCol === col) targetCol = COLS - 1; // No data found, go to last row
      } else if (e.key === "ArrowLeft") {
        for (let c = col - 1; c >= 0; c--) {
          if (this.getCellValueIfExists(row, c) !== "") {
            targetCol = c;
            break;
          }
        }
        if (targetCol === col) targetCol = 0; // No data found, go to first row
      }
      this.selMgr.clearSelection();
      this.selMgr.selectCell(row, targetCol);
      this.scrollToCell(row, targetCol);
      this.scheduleRender();
      return;
    }
    if (this.editingCell) return;
    //if any key is pressed while cell is seleted start editing but stop on enter or escape and support ctrl +z and ctrl +y

    // For row selection
    const selectedRow = this.selMgr.getSelectedRow();
    if (typeof selectedRow === "number") {
      if (e.shiftKey) {
        if (this.rowSelectionAnchor === null) {
          // Use the first/last of the selected range as anchor if available

          const selRows = this.selMgr.getSelectedRows();
          this.rowSelectionAnchor =
            selRows.length > 0 ? selRows[0] : selectedRow;
        }
        if (this.rowSelectionFocus === null) {
          // Use the last of the selected range as focus if available
          const selRows = this.selMgr.getSelectedRows();
          this.rowSelectionFocus =
            selRows.length > 0 ? selRows[selRows.length - 1] : selectedRow;
        }
        let anchor = this.rowSelectionAnchor;
        this.pendingEditCell = { row: this.rowSelectionAnchor, col: 0 };
        let focus = this.rowSelectionFocus;
        if (e.key === "ArrowDown" && focus < ROWS - 1) {
          focus = focus + 1;
        } else if (e.key === "ArrowUp" && focus > 0) {
          focus = focus - 1;
        }
        this.rowSelectionFocus = focus;
        const startRow = Math.min(anchor, focus);
        const endRow = Math.max(anchor, focus);
        const newRows: number[] = [];
        for (let r = startRow; r <= endRow; r++) newRows.push(r);
        this.selMgr.setSelectedRows(newRows);
        this.scrollToCell(focus, 0); // Scroll to the new focus row
        this.scheduleRender();
        this.computeSelectionStats();
        this.updateToolbarState();
        return;
      }
    }
    // For column selection
    const selectedCol = this.selMgr.getSelectedCol();
    if (typeof selectedCol === "number") {
      if (e.shiftKey) {
        if (this.columnSelectionAnchor === null) {
          // Use the first/last of the selected range as anchor if available
          const selCols = this.selMgr.getSelectedColumns();
          this.columnSelectionAnchor =
            selCols.length > 0 ? selCols[0] : selectedCol;
        }
        if (this.columnSelectionFocus === null) {
          // Use the last of the selected range as focus if available
          const selCols = this.selMgr.getSelectedColumns();
          this.columnSelectionFocus =
            selCols.length > 0 ? selCols[selCols.length - 1] : selectedCol;
        }
        let anchor = this.columnSelectionAnchor;
        this.pendingEditCell = { row: 0, col: this.columnSelectionAnchor };
        let focus = this.columnSelectionFocus;
        if (e.key === "ArrowRight" && focus < COLS - 1) {
          focus = focus + 1;
        } else if (e.key === "ArrowLeft" && focus > 0) {
          focus = focus - 1;
        }
        this.columnSelectionFocus = focus;
        // Always select the range between anchor and focus
        const startCol = Math.min(anchor, focus);
        const endCol = Math.max(anchor, focus);
        const newCols: number[] = [];
        for (let c = startCol; c <= endCol; c++) newCols.push(c);
        this.selMgr.setSelectedColumns(newCols);
        this.scrollToCell(0, focus); // Scroll to the new focus column
        this.scheduleRender();
        this.computeSelectionStats();
        this.updateToolbarState();
        return;
      }
    } else {
      // If no column/row is selected, reset anchor/focus
      this.columnSelectionAnchor = null;
      this.columnSelectionFocus = null;
      this.rowSelectionAnchor = null;
      this.rowSelectionFocus = null;
    }
    if (
      e.key === "ArrowRight" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      const selected = this.selMgr.getSelectedCell();
      // If dragging, anchor is dragStart, otherwise anchor is selected cell
      let anchorRow: number, anchorCol: number;
      if (this.selMgr.isDragging() && this.selMgr["dragStart"]) {
        anchorRow = this.selMgr["dragStart"].row!;
        anchorCol = this.selMgr["dragStart"].col!;
      } else if (selected) {
        anchorRow = selected.row;
        anchorCol = selected.col;
      } else {
        return;
      }
      // Ensure anchorRow and anchorCol are numbers (never null)
      if (typeof anchorRow !== "number" && selected) anchorRow = selected.row;
      if (typeof anchorCol !== "number" && selected) anchorCol = selected.col;
      // Determine new focus cell
      let focusRow =
        this.selMgr.isDragging() &&
          this.selMgr["dragEnd"] &&
          typeof this.selMgr["dragEnd"].row === "number"
          ? this.selMgr["dragEnd"].row
          : anchorRow;
      let focusCol =
        this.selMgr.isDragging() &&
          this.selMgr["dragEnd"] &&
          typeof this.selMgr["dragEnd"].col === "number"
          ? this.selMgr["dragEnd"].col
          : anchorCol;
      // Ensure focusRow and focusCol are numbers
      if (typeof focusRow !== "number") focusRow = anchorRow;
      if (typeof focusCol !== "number") focusCol = anchorCol;
      switch (e.key) {
        case "ArrowRight":
          if (focusCol < COLS - 1) focusCol++;
          break;
        case "ArrowLeft":
          if (focusCol > 0) focusCol--;
          break;
        case "ArrowDown":
          if (focusRow < ROWS - 1) focusRow++;
          break;
        case "ArrowUp":
          if (focusRow > 0) focusRow--;
          break;
      }
      if (e.shiftKey) {
        if (!this.selMgr.isDragging()) {
          this.selMgr.startDrag(anchorRow, anchorCol);
          this.pendingEditCell = { row: anchorRow, col: anchorCol };
        }
        this.selMgr.updateDrag(focusRow, focusCol);
        this.scrollToCell(focusRow, focusCol);
        this.scheduleRender();
        return;
      } else {
        this.selMgr.clearSelection();
        this.selMgr.selectCell(focusRow, focusCol);
        this.scrollToCell(focusRow, focusCol);
        this.scheduleRender();
        this.computeSelectionStats();
      }
    }
    if (e.ctrlKey && e.key === "a") {
      this.selMgr.selectAll();
      this.editingCell = null;
      this.pendingEditCell = null;
      this.scheduleRender();
      return;
    }
    if (e.ctrlKey && e.key === "b") {
      this.onBoldToggle();
      return;
    }
    if (e.ctrlKey && e.key === "i") {
      this.onItalicToggle();
      return;
    }
    if (e.key === "Backspace") {
      if (this.selMgr.getSelectedCell() !== null) {
        const cell = this.getCell(
          this.selMgr.getSelectedCell()!.row,
          this.selMgr.getSelectedCell()!.col
        );
        const command = new EditCellCommand(this, cell, cell.getValue(), "");
        this.commandManager.execute(command);
      }
      if (this.selMgr.getSelectedRow() !== null) {
        this.onDeleteRow();
      }
      if (this.selMgr.getSelectedCol() !== null) {
        this.onDeleteColumn();
      }
      this.scheduleRender();
      return;
    }
    if (e.key === "Delete") {
      if (this.selMgr.getSelectedCell() !== null) {
        const cell = this.getCell(
          this.selMgr.getSelectedCell()!.row,
          this.selMgr.getSelectedCell()!.col
        );
        const command = new EditCellCommand(this, cell, cell.getValue(), "");
        this.commandManager.execute(command);
      }
      if (this.selMgr.getSelectedRow() !== null) {
        this.onDeleteRow();
      }
      if (this.selMgr.getSelectedCol() !== null) {
        this.onDeleteColumn();
      }
      this.scheduleRender();
      return;
    }
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      this.commandManager.undo();
      this.scheduleRender();
      return;
    }
    if (e.ctrlKey && e.key === "y") {
      e.preventDefault();
      this.commandManager.redo();
      this.scheduleRender();
      return;
    }
    const active = document.activeElement;
    if (
      this.selMgr.getSelectedCell() !== null &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (!active ||
        (active.tagName !== "INPUT" &&
          active.tagName !== "TEXTAREA" &&
          active.getAttribute("contenteditable") !== "true"))
    ) {
      e.preventDefault();

      const selectedCell = this.selMgr.getSelectedCell()!;
      this.pendingEditCell = { row: selectedCell.row, col: selectedCell.col };
      this.startEditingCell(selectedCell.row, selectedCell.col, e.key);
      return;
    }
    if (
      this.pendingEditCell &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (!target ||
        (target.tagName !== "INPUT" &&
          target.tagName !== "TEXTAREA" &&
          target.getAttribute("contenteditable") !== "true"))
    ) {
      e.preventDefault();
      const { row, col } = this.pendingEditCell;
      this.ctx.restore();
      this.startEditingCell(row, col, e.key);
      this.pendingEditCell = null;
      return;
    }
    this.computeSelectionStats();
    this.updateToolbarState();
    if (this.editingCell && e.key === "Enter") {
      // If a drag selection exists and is more than one cell
      const rect = this.selMgr.getDragRect();
      if (
        rect &&
        (rect.endRow > rect.startRow || rect.endCol > rect.startCol)
      ) {
        const { row, col } = this.editingCell;
        let nextRow = row + 1;
        // If at the bottom, wrap to the top
        if (nextRow > rect.endRow) nextRow = rect.startRow;
        // Only move within the selected column
        this.pendingEditCell = { row: nextRow, col };
      } else {
        this.pendingEditCell = null;
      }
      // this.finishEditing(true);
      // Immediately start editing the next cell if pendingEditCell is set
      if (this.pendingEditCell) {
        const { row, col } = this.pendingEditCell;
        this.startEditingCell(row, col);
        this.pendingEditCell = null;
      }
      return;
    }
    if (e.key === "Enter" || e.key === "Escape") {
      this.finishEditing(true);
      return;
    }
    // Only handle navigation if not editing a cell
  }

  /**
   * Start editing a cell
   * @param row - The row of the cell
   * @param col - The column of the cell
   */
  private startEditingCell(
    row: number,
    col: number,
    initialValue?: string
  ): void {
    const cell = this.getCell(row, col); // Creates only once
    this.editingCellInstance = cell;

    if (!this.editorInput) this.createEditorInput();

    // Check if cell has a formula (either in value or formula property)
    const cellValue = cell.getValue();
    if (cellValue.startsWith("=") || cell.hasFormula()) {
      this.formulaRange = this.extractRangeFromFormula(cellValue);
      this.startMarchingAntsAnimation();
    } else {
      this.formulaRange = null;
      this.stopMarchingAntsAnimation();
    }

    this.pendingEditCell = null;
    this.editingCell = { row, col };

    // Always show the formula if the cell has one, otherwise show the value
    if (typeof initialValue === "string") {
      this.editorInput!.value = initialValue;
    } else if (cell.hasFormula()) {
      this.editorInput!.value = cell.getFormula();
    } else {
      this.editorInput!.value = cell.getValue();
    }

    this.updateEditorPosition();
    this.editorInput!.focus();
    // Move cursor to end for normal edit, or after first char for initialValue
    if (typeof initialValue === "string") {
      this.editorInput!.setSelectionRange(
        initialValue.length,
        initialValue.length
      );
    }
  }

  // Public method to check if editing
  public isEditing(): boolean {
    return !!this.editingCell && !!this.editorInput;
  }

  /**
   * Creates an input element
   */
  private createEditorInput(): void {
    this.editorInput = document.createElement("input");
    this.editorInput.className = "cell-editor";
    this.editorInput.type = "text";
    this.editorInput.style.paddingRight = "4px";
    // Only show border if this is a pendingEditCell (set dynamically elsewhere)
    this.editorInput.style.border = "none";
    this.editorInput.style.outline = "none";
    this.editorInput.style.fontSize = "14px";
    this.editorInput.style.fontFamily = "Arial, sans-serif";
    this.editorInput.style.color = "#222";
    this.editorInput.style.textAlign = "left";
    this.editorInput.style.paddingLeft = "5px";
    // this.editorInput.style.backgroundColor = "transparent !important";
    this.container.appendChild(this.editorInput);

    this.editorInput.addEventListener("blur", () => this.finishEditing(true));
    this.editorInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.finishEditing(true);
      } else if (e.key === "Escape") {
        this.finishEditing(false);
      } else if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();
        if (this.editingCell) {
          const { row, col } = this.editingCell;
          let nextRow = row,
            nextCol = col;
          if (e.key === "ArrowDown" && row < ROWS - 1) nextRow++;
          if (e.key === "ArrowUp" && row > 0) nextRow--;
          if (e.key === "ArrowLeft" && col > 0) nextCol--;
          if (e.key === "ArrowRight" && col < COLS - 1) nextCol++;
          this.finishEditing(true);
          this.selMgr.selectCell(nextRow, nextCol);
          this.startEditingCell(nextRow, nextCol);
        }
      }
    });

    // Add real-time formula range detection
    this.editorInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const value = target.value;

      if (value.startsWith("=")) {
        try {
          this.formulaRange = this.extractRangeFromFormula(value);
          this.startMarchingAntsAnimation();
        } catch (error) {
          // If formula is invalid, clear the range
          this.formulaRange = null;
          this.stopMarchingAntsAnimation();
        }
      } else {
        // Not a formula, clear the range
        this.formulaRange = null;
        this.stopMarchingAntsAnimation();
      }
    });

    this.editorInput.style.caretColor = "transparent";
    this.editorInput.addEventListener("focus", () => {
      this.editorInput!.style.caretColor = "#107C41";
    });
    this.editorInput.addEventListener("blur", () => {
      this.editorInput!.style.caretColor = "transparent";
    });
  }
  /**
   * Extracts the range from a formula
   * @param formula - The formula to extract the range from
   * @returns The range of the formula
   */
  private extractRangeFromFormula(formula: string): {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null {
    // Remove the = sign if present
    const cleanFormula = formula.startsWith("=")
      ? formula.substring(1)
      : formula;

    // Match single cell reference like A1, B5, etc.
    const singleCellMatch = cleanFormula.match(/^([A-Z]+[0-9]+)$/i);
    if (singleCellMatch) {
      const cellRef = singleCellMatch[1];
      const { row, col } = getCoordinates(cellRef);
      return { startRow: row, startCol: col, endRow: row, endCol: col };
    }

    // Match function with range like SUM(A1:B5), COUNT(A1:A10), etc.
    const functionMatch = cleanFormula.match(
      /^\w+\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/i
    );
    if (functionMatch) {
      const [, start, end] = functionMatch;
      const { row: startRow, col: startCol } = getCoordinates(start);
      const { row: endRow, col: endCol } = getCoordinates(end);
      return { startRow, startCol, endRow, endCol };
    }

    // If no valid pattern found, return null
    return null;
  }
  /**
   * Searches for a cell
   * @param searchTerm - The term to search for
   */
  private searchCell(searchTerm: string): void {
    if (!searchTerm.trim()) {
      // Clear search when input is empty
      this.clearSearch();
      return;
    }

    const searchResults: { row: number; col: number; value: string }[] = [];
    const term = searchTerm.toLowerCase();

    // Search through all cells
    for (const [row, rowMap] of this.cells.entries()) {
      for (const [col, cell] of rowMap.entries()) {
        const cellValue = cell.getValue().toLowerCase();
        if (cellValue.includes(term)) {
          searchResults.push({ row, col, value: cell.getValue() });
        }
      }
    }

    if (searchResults.length > 0) {
      // Select the first match
      const firstMatch = searchResults[0];
      this.selMgr.selectCell(firstMatch.row, firstMatch.col);

      // Store search results for navigation
      this.currentSearchResults = searchResults;
      this.currentSearchIndex = 0;

      // Update search status
      this.updateSearchStatus(
        searchResults.length,
        this.currentSearchIndex + 1
      );

      // Scroll to the selected cell
      this.scrollToCell(firstMatch.row, firstMatch.col);

      this.scheduleRender();
    } else {
      // No matches found
      this.updateSearchStatus(0, 0);
      this.selMgr.clearSelection();
      this.scheduleRender();
    }
  }

  private currentSearchResults: { row: number; col: number; value: string }[] =
    [];
  private currentSearchIndex: number = 0;

  /**
   * Clears the search
   */
  private clearSearch(): void {
    this.currentSearchResults = [];
    this.currentSearchIndex = 0;
    this.updateSearchStatus(0, 0);
    this.selMgr.clearSelection();
    this.scheduleRender();
  }

  /**
   * Navigates through the search results
   * @param direction - The direction to navigate
   */
  private navigateSearchResults(direction: "next" | "prev"): void {
    if (this.currentSearchResults.length === 0) return;

    if (direction === "next") {
      this.currentSearchIndex =
        (this.currentSearchIndex + 1) % this.currentSearchResults.length;
    } else {
      this.currentSearchIndex =
        this.currentSearchIndex === 0
          ? this.currentSearchResults.length - 1
          : this.currentSearchIndex - 1;
    }

    const match = this.currentSearchResults[this.currentSearchIndex];
    this.selMgr.selectCell(match.row, match.col);
    this.scrollToCell(match.row, match.col);
    this.updateSearchStatus(
      this.currentSearchResults.length,
      this.currentSearchIndex + 1
    );
    this.scheduleRender();
  }
  /**
   * Scrolls to a cell and ensures it is visible.
   * @param row The row index
   * @param col The column index
   */
  public scrollToCell(row: number, col: number): void { // Made public
    const cellX = this.colMgr.getX(col);
    const cellY = this.rowMgr.getY(row);
    const cellWidth = this.colMgr.getWidth(col);
    const cellHeight = this.rowMgr.getHeight(row);

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    // Calculate the visible area (accounting for headers)
    const visibleWidth = containerWidth - this.rowHeaderWidth;
    const visibleHeight = containerHeight - HEADER_SIZE;

    // Calculate target scroll position to ensure cell is visible
    let targetScrollX = this.container.scrollLeft;
    let targetScrollY = this.container.scrollTop;

    // Check if cell is outside visible area horizontally
    const cellRight = cellX + cellWidth;
    const cellLeft = cellX;
    const visibleRight = this.container.scrollLeft + visibleWidth;
    const visibleLeft = this.container.scrollLeft;

    if (cellRight > visibleRight) {
      // Cell is to the right of visible area
      targetScrollX = cellRight - visibleWidth + 200;
    } else if (cellLeft < visibleLeft) {
      // Cell is to the left of visible area
      targetScrollX = cellLeft - 200;
    }

    // Check if cell is outside visible area vertically
    const cellBottom = cellY + cellHeight;
    const cellTop = cellY;
    const visibleBottom = this.container.scrollTop + visibleHeight;
    const visibleTop = this.container.scrollTop;

    if (cellBottom > visibleBottom) {
      // Cell is below visible area
      targetScrollY = cellBottom - visibleHeight + 200;
    } else if (cellTop < visibleTop) {
      // Cell is above visible area
      targetScrollY = cellTop - 200;
    }

    // Ensure scroll position is within bounds
    targetScrollX = Math.max(
      0,
      Math.min(targetScrollX, this.colMgr.getTotalWidth() - visibleWidth)
    );
    targetScrollY = Math.max(
      0,
      Math.min(targetScrollY, this.rowMgr.getTotalHeight() - visibleHeight)
    );

    // Only scroll if the position actually changed
    if (
      targetScrollX !== this.container.scrollLeft ||
      targetScrollY !== this.container.scrollTop
    ) {
      this.container.scrollTo({
        left: targetScrollX,
        top: targetScrollY,
        behavior: "auto",
      });
    }
  }

  /**
   * Updates the search status
   * @param totalMatches - The total number of matches
   * @param currentMatch - The current match
   */
  private updateSearchStatus(totalMatches: number, currentMatch: number): void {
    const searchStatus = document.getElementById("searchStatus");
    if (searchStatus) {
      if (totalMatches === 0) {
        searchStatus.textContent = "No matches found";
        searchStatus.style.color = "#d32f2f";
      } else {
        searchStatus.textContent = `${currentMatch} of ${totalMatches} matches`;
        searchStatus.style.color = "#1976d2";
      }
    }
  }

  /**
   * Draws the marching ants
   * @param startRow - The start row
   * @param startCol - The start column
   * @param endRow - The end row
   * @param endCol - The end column
   */
  public drawMarchingAnts(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    color: string = "#217346"
  ): void {
    // Always draw the rectangle for the full range, regardless of cell data
    const ctx = this.canvas.getContext("2d")!;
    const x1 =
      this.rowHeaderWidth +
      this.colMgr.getX(startCol) -
      this.container.scrollLeft;
    const y1 =
      HEADER_SIZE + this.rowMgr.getY(startRow) - this.container.scrollTop;
    const x2 =
      this.rowHeaderWidth +
      this.colMgr.getX(endCol) +
      this.colMgr.getWidth(endCol) -
      this.container.scrollLeft;
    const y2 =
      HEADER_SIZE +
      this.rowMgr.getY(endRow) +
      this.rowMgr.getHeight(endRow) -
      this.container.scrollTop;

    ctx.save();
    ctx.lineWidth = 3 / dpr;
    ctx.setLineDash([3, 3]);

    // First stroke: white (this becomes the gaps for the second stroke)
    ctx.strokeStyle = "white";
    ctx.lineDashOffset = this.dashOffset;
    ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);

    // Second stroke: black (dashes appear between the white gaps)
    ctx.strokeStyle = "#107C41";
    ctx.lineDashOffset = this.dashOffset + 3; // half cycle shift
    ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);

    ctx.restore();
  }

  /**
   * Updates the editor position
   */
  public updateEditorPosition(): void { // Made public
    if (!this.editingCell || !this.editorInput) return;

    const { row, col } = this.editingCell;
    const scrollX = this.container.scrollLeft;
    const scrollY = this.container.scrollTop;

    // Get header and toolbar heights from CSS variables (parse as float, trim spaces)
    const root = document.documentElement;
    const headerHeight =
      parseFloat(
        getComputedStyle(root).getPropertyValue("--header-height").trim()
      ) || 56;
    const toolbarHeight =
      parseFloat(
        getComputedStyle(root).getPropertyValue("--toolbar-height").trim()
      ) || 48;

    // Add HEADER_SIZE for the grid's own header row
    const left = this.rowHeaderWidth + this.colMgr.getX(col) - scrollX;
    const top =
      headerHeight +
      toolbarHeight +
      HEADER_SIZE +
      this.rowMgr.getY(row) -
      scrollY;

    // Determine padding based on cell value (numeric = right-aligned)
    let paddingLeft = "8px";
    let paddingRight = "8px";
    const cell = this.getCellIfExists(row, col);
    if (cell && this.isNumericValue(cell.getValue())) {
      paddingLeft = "0px";
      paddingRight = "8px";
      this.editorInput.style.textAlign = "right";
    } else {
      paddingLeft = "7px";
      paddingRight = "8px";
      this.editorInput.style.textAlign = "left";
    }

    Object.assign(this.editorInput.style, {
      left: `${left + 1}px`,
      top: `${top + 1}px`,
      width: `${this.colMgr.getWidth(col) - 3}px`,
      height: `${this.rowMgr.getHeight(row) - 2}px`,
      zIndex: "8",
      display: "block",
      paddingLeft,
      paddingRight,
      paddingTop: `${this.rowMgr.getHeight(row) - 22}px`, // Push text to bottom
      paddingBottom: "0px",
      lineHeight: "16px", // match font size or desired line height
      verticalAlign: "bottom", // optional, does nothing here
    });
  }

  /**
   * Finishes editing a cell
   * @param commit - Whether to commit the changes
   */
  public finishEditing(commit: boolean): void { // Made public
    // console.log("finishEditing called", commit, this.editingCell, this.editorInput);
    if (!this.editorInput || !this.editingCell || !this.editingCellInstance)
      return;

    const cell = this.editingCellInstance; // ← Use the cached one
    const oldValue = cell.getValue();
    const newValue = this.editorInput.value;

    if (commit && newValue !== oldValue) {
      // Check if the new value is a formula
      if (Cell.isFormula(newValue)) {
        // Store the formula and evaluate it
        cell.setFormula(newValue);
        try {
          const result = this.evaluateCellFormula(cell);
          cell.setValue(result);
        } catch (error) {
          cell.setValue("#ERROR");
          console.error("Formula error:", error);
        }
      } else {
        // Regular value - remove any existing formula
        cell.removeFormula();
        cell.setValue(newValue);
      }
      this.formulaRange = null;
      this.stopMarchingAntsAnimation();
      const command = new EditCellCommand(
        this,
        cell,
        oldValue,
        cell.getValue()
      );
      this.commandManager.execute(command);
    } else {
      // Even if not committing, stop animation when editing ends
      this.formulaRange = null;
      this.stopMarchingAntsAnimation();
    }

    // If another cell is selected, shift focus there and start editing
    const selectedCell = this.selMgr.getSelectedCell();
    if (
      selectedCell &&
      (!this.editingCell ||
        selectedCell.row !== this.editingCell.row ||
        selectedCell.col !== this.editingCell.col)
    ) {
      this.editorInput.style.display = "none";
      this.editingCellInstance = null;
      this.editingCell = null;
      this.scheduleRender();
      this.startEditingCell(selectedCell.row, selectedCell.col);
      return;
    }

    this.editorInput.style.display = "none";
    this.editingCell = null;
    this.editingCellInstance = null;
    this.scheduleRender();
  }

  /**
   * Evaluates a formula for a given cell.
   * @param {Cell} cell The cell containing the formula.
   * @returns {string} The result of the formula evaluation.
   */
  private evaluateCellFormula(cell: Cell): string {
    const formula = cell.getFormula();
    if (!formula || !Cell.isFormula(formula)) {
      return cell.getValue();
    }

    // Extract the formula part (remove the = sign)
    const formulaText = formula.substring(1);

    try {
      return evaluateFormula(formulaText, this);
    } catch (error) {
      console.error("Formula evaluation error:", error);
      return "#ERROR";
    }
  }

  /**
   * Recalculates all formulas in the grid.
   * Call this when cell values change that might affect formulas.
   */
  public recalculateFormulas(): void {
    for (const rowMap of this.cells.values()) {
      for (const cell of rowMap.values()) {
        if (cell.hasFormula()) {
          try {
            const result = this.evaluateCellFormula(cell);
            cell.setValue(result);
          } catch (error) {
            cell.setValue("#ERROR");
            console.error("Formula recalculation error:", error);
          }
        }
      }
    }
    this.scheduleRender();
  }
  /**
   * Gets the visible range of the grid.
   * @returns the visible range of the grid
   */
  private getVisibleRange(): {
    firstRow: number;
    lastRow: number;
    firstCol: number;
    lastCol: number;
  } {
    const scrollX = this.container.scrollLeft;
    const scrollY = this.container.scrollTop;
    const viewW = this.container.clientWidth;
    const viewH = this.container.clientHeight;

    let firstRow = 0,
      lastRow = ROWS - 1;
    let y = 0;
    for (let r = 0; r < ROWS; r++) {
      const h = this.rowMgr.getHeight(r);
      if (y + h >= scrollY - RENDER_BUFFER_PX) {
        firstRow = r;
        break;
      }
      y += h;
    }

    let rowY = y;
    for (let r = firstRow; r < ROWS; r++) {
      const h = this.rowMgr.getHeight(r);
      if (rowY > scrollY + viewH + RENDER_BUFFER_PX) {
        lastRow = r;
        // if (lastRow > 1000) {
        //   HEADER_SIZE = HEADER_SIZE + 5;
        // }
        break;
      }
      rowY += h;
    }

    let firstCol = 0,
      lastCol = COLS - 1;
    let x = 0;
    for (let c = 0; c < COLS; c++) {
      const w = this.colMgr.getWidth(c);
      if (x + w >= scrollX - RENDER_BUFFER_PX) {
        firstCol = c;
        break;
      }
      x += w;
    }

    let colX = x;
    for (let c = firstCol; c < COLS; c++) {
      const w = this.colMgr.getWidth(c);
      if (colX > scrollX + viewW + RENDER_BUFFER_PX) {
        lastCol = c;
        break;
      }
      colX += w;
    }

    return { firstRow, lastRow, firstCol, lastCol };
  }

  /**
   * Renders the grid.
   */
  private render(): void {
    const dpr = window.devicePixelRatio || 1;
    // Set canvas size in physical pixels for crisp lines
    this.canvas.width = this.container.clientWidth * dpr;
    this.canvas.height = this.container.clientHeight * dpr;
    this.canvas.style.width = this.container.clientWidth + "px";
    this.canvas.style.height = this.container.clientHeight + "px";
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
    this.ctx.scale(dpr, dpr);
    const scrollX = this.container.scrollLeft;
    const scrollY = this.container.scrollTop;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw the top-left box (intersection of row/col headers)
    const isTopLeftHovered = this._isTopLeftHovered || false;
    this.ctx.save();
    this.ctx.fillStyle = isTopLeftHovered ? "#e0e0e0" : "#F5F5F5"; // Hover effect
    this.ctx.fillRect(0, 0, this.rowHeaderWidth, HEADER_SIZE);
    this.ctx.strokeStyle = "#b7c6d5"; // Match your header border
    this.ctx.lineWidth = 1 / dpr;
    this.ctx.strokeRect(0, 0, this.rowHeaderWidth, HEADER_SIZE);
    // Draw a bold select-all icon (3x3 grid) in the top-left box
    this.ctx.save();
    // this.ctx.strokeStyle = "#222"; // Even darker for visibility
    // this.ctx.lineWidth = 2.5;
    // const iconBox = Math.min(this.rowHeaderWidth, HEADER_SIZE) * 0.7;
    // const iconX = (this.rowHeaderWidth - iconBox) / 2;
    // const iconY = (HEADER_SIZE - iconBox) / 2;
    // for (let i = 0; i <= 3; i++) {
    //   // Vertical lines
    //   this.ctx.beginPath();
    //   this.ctx.moveTo(iconX + (iconBox / 3) * i, iconY);
    //   this.ctx.lineTo(iconX + (iconBox / 3) * i, iconY + iconBox);
    //   this.ctx.stroke();
    //   // Horizontal lines
    //   this.ctx.beginPath();
    //   this.ctx.moveTo(iconX, iconY + (iconBox / 3) * i);
    //   this.ctx.lineTo(iconX + iconBox, iconY + (iconBox / 3) * i);
    //   this.ctx.stroke();
    // }
    this.ctx.restore();
    this.ctx.restore();

    const { firstRow, lastRow, firstCol, lastCol } = this.getVisibleRange();

    // Draw marching ants for formula range if active
    if (this.formulaRange) {
      const { startRow, startCol, endRow, endCol } = this.formulaRange;
      this.drawMarchingAnts(startRow, startCol, endRow, endCol);
    }

    // Draw cells (only grid lines, not filled rectangles)
    let yPos = HEADER_SIZE + this.rowMgr.getY(firstRow) - scrollY;
    for (let r = firstRow; r <= lastRow; r++) {
      const rowH = this.rowMgr.getHeight(r);
      let xPos = this.rowHeaderWidth + this.colMgr.getX(firstCol) - scrollX;
      const rowMap = this.cells.get(r);
      for (let c = firstCol; c <= lastCol; c++) {
        const colW = this.colMgr.getWidth(c);

        // Draw search highlight if this cell is a search result
        if (this.isSearchResult(r, c)) {
          this.ctx.fillStyle = "rgba(34, 168, 0, 0.12)";
          this.ctx.fillRect(xPos, yPos, colW, rowH);
        }

        // Draw cell text
        const cell = rowMap?.get(c);
        const cellValue = rowMap?.get(c)?.getValue() || "";
        const isNumeric = this.isNumericValue(cellValue);
        let effectiveAlignment: "left" | "center" | "right";
        const alignment = cell?.getAlignment();
        if (
          alignment === "left" ||
          alignment === "center" ||
          alignment === "right"
        ) {
          effectiveAlignment = alignment;
        } else if (isNumeric) {
          effectiveAlignment = "right";
        } else {
          effectiveAlignment = "left";
        }
        if (cell) {
          const fontSize = cell.getFontSize();
          const isBold = cell.getIsBold();
          const isItalic = cell.getIsItalic();
          let fontStyle = "";
          if (isBold && isItalic) {
            fontStyle = "bold italic";
          } else if (isBold) {
            fontStyle = "bold";
          } else if (isItalic) {
            fontStyle = "italic";
          } else {
            fontStyle = "normal";
          }
          this.ctx.font = `${fontStyle} ${fontSize}px 'Arial', sans-serif`;
        } else {
          this.ctx.font = "14px 'Arial', sans-serif";
        }
        this.ctx.textAlign = effectiveAlignment;
        this.ctx.textBaseline = "middle";
        const clipped = this.clipText(cellValue, colW - 16);
        let textX: number;
        if (effectiveAlignment === "right") textX = xPos + colW - 8;
        else if (effectiveAlignment === "center") textX = xPos + colW / 2;
        else textX = xPos + 8;
        this.ctx.fillText(clipped, textX, yPos + rowH - 10);
        xPos += colW;
      }
      yPos += rowH;
    }

    // Draw vertical grid lines
    let gridX = this.rowHeaderWidth + this.colMgr.getX(firstCol) - scrollX;
    for (let c = firstCol; c <= lastCol + 1; c++) {
      this.ctx.beginPath();
      this.ctx.moveTo(gridX + 0.5, HEADER_SIZE);
      this.ctx.lineTo(gridX + 0.5, this.canvas.height / dpr);
      this.ctx.strokeStyle = "#d4d4d4";
      this.ctx.lineWidth = 1 / dpr;
      this.ctx.stroke();
      if (c <= lastCol) gridX += this.colMgr.getWidth(c);
    }

    // Draw horizontal grid lines
    let gridY = HEADER_SIZE + this.rowMgr.getY(firstRow) - scrollY;
    for (let r = firstRow; r <= lastRow + 1; r++) {
      this.ctx.beginPath();
      this.ctx.moveTo(HEADER_SIZE, gridY + 0.5);
      this.ctx.lineTo(this.canvas.width / dpr, gridY + 0.5);
      this.ctx.strokeStyle = "#d4d4d4";
      this.ctx.lineWidth = 1 / dpr;
      this.ctx.stroke();
      if (r <= lastRow) gridY += this.rowMgr.getHeight(r);
    }

    // Draw selection overlay BEFORE headers so headers cover selection
    this.selMgr.drawSelection(
      this.ctx,
      this.rowMgr,
      this.colMgr,
      HEADER_SIZE,
      this.rowHeaderWidth,
      scrollX,
      scrollY
    );

    // Draw headers LAST so they are on top

    // Highlight pendingEditCell (soft focus, no border)
    if (this.pendingEditCell) {
      const { row, col } = this.pendingEditCell;
      const x = this.rowHeaderWidth + this.colMgr.getX(col) - scrollX;
      const y = HEADER_SIZE + this.rowMgr.getY(row) - scrollY;
      const w = this.colMgr.getWidth(col);
      const h = this.rowMgr.getHeight(row);
      this.ctx.save();
      this.ctx.fillStyle = "#fff";
      this.ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      // Draw the cell text again so it's visible on white
      const cell = this.getCellIfExists(row, col);
      if (cell) {
        const fontSize = cell.getFontSize();
        const isBold = cell.getIsBold();
        const isItalic = cell.getIsItalic();
        const alignment = cell.getAlignment();
        let fontStyle = "";
        if (isBold && isItalic) fontStyle = "bold italic";
        else if (isBold) fontStyle = "bold";
        else if (isItalic) fontStyle = "italic";
        else fontStyle = "normal";
        this.ctx.font = `${fontStyle} ${fontSize}px 'Arial', sans-serif`;
        const cellValue = cell.getValue() || "";
        this.ctx.fillStyle = "#222";
        this.ctx.textBaseline = "middle";
        const isNumeric = this.isNumericValue(cellValue);
        let effectiveAlignment: "left" | "center" | "right";
        if (alignment) {
          effectiveAlignment = alignment;
        } else if (isNumeric) {
          effectiveAlignment = "right";
        } else {
          effectiveAlignment = "left";
        }
        this.ctx.textAlign = effectiveAlignment;
        const clipped = this.clipText(cellValue, w - 16);
        let textX: number;
        if (effectiveAlignment === "right") textX = x + w - 8;
        else if (effectiveAlignment === "center") textX = x + w / 2;
        else textX = x + 8;
        this.ctx.fillText(clipped, textX, y + h - 10);
      }
      this.ctx.restore();
    }

    // Draw a green border around the cell being edited ONLY if the editor input is visible
    // if (this.editingCell && this.editorInput && this.editorInput.style.opacity !== '0' && document.activeElement === this.editorInput) {
    //   const { row, col } = this.editingCell;
    //   const x = this.rowHeaderWidth + this.colMgr.getX(col) - scrollX;
    //   const y = HEADER_SIZE + this.rowMgr.getY(row) - scrollY;
    //   const w = this.colMgr.getWidth(col);
    //   const h = this.rowMgr.getHeight(row);
    //   this.ctx.save();
    //   this.ctx.strokeStyle = "#107C41";
    //   this.ctx.lineWidth = 2;
    //   this.ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    //   this.ctx.restore();
    // }
    // At the end of render(), always reset isKeyDown to false

    let x = this.rowHeaderWidth + this.colMgr.getX(firstCol) - scrollX;
    for (let c = firstCol; c <= lastCol; c++) {
      const w = this.colMgr.getWidth(c);
      this.drawHeader(c, true, x, w);
      x += w;
    }
    let y = HEADER_SIZE + this.rowMgr.getY(firstRow) - scrollY;

    for (let r = firstRow; r <= lastRow; r++) {
      const h = this.rowMgr.getHeight(r);
      this.drawHeader(r, false, y, h);
      y += h;
    }

    // Draw marching ants and border for copy only
    if (this.copyRange) {
      // Draw solid border around the whole selected area
      //this.drawCopyBorder(this.copyRange.startRow, this.copyRange.startCol, this.copyRange.endRow, this.copyRange.endCol, "#217346");
      // Draw marching ants
      this.drawMarchingAnts(
        this.copyRange.startRow,
        this.copyRange.startCol,
        this.copyRange.endRow,
        this.copyRange.endCol,
        "#217346"
      ); // green
    }
    if (this.formulaRange) {
      this.drawMarchingAnts(
        this.formulaRange.startRow,
        this.formulaRange.startCol,
        this.formulaRange.endRow,
        this.formulaRange.endCol,
        "#217346"
      ); // green
    }
    // Remove paste marching ants
    // if (this.pasteRange) {
    //   this.drawMarchingAnts(this.pasteRange.startRow, this.pasteRange.startCol, this.pasteRange.endRow, this.pasteRange.endCol, "#1976d2"); // blue
    // }
  }

  private isSearchResult(row: number, col: number): boolean {
    return this.currentSearchResults.some(
      (result) => result.row === row && result.col === col
    );
  }

  /**
   * Clips text to a maximum width.
   * @param text the text to clip
   * @param maxWidth the maximum width
   * @returns the clipped text
   */
  private clipText(text: string, maxWidth: number): string {
    if (this.ctx.measureText(text).width <= maxWidth) return text;
    while (
      text.length > 0 &&
      this.ctx.measureText(text + "…").width > maxWidth
    ) {
      text = text.slice(0, -1);
    }
    return text + "…";
  }

  /**
   * Checks if a cell value contains only digits, decimals, or percentages.
   * @param value the cell value to check
   * @returns true if the value contains only digits, decimals, or percentages, false otherwise
   */
  private isNumericValue(value: string): boolean {
    const cleanValue = value.trim();
    return /^\d+$|^\d+\.\d+$|^\d+%$|^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/.test(
      cleanValue
    );
  }

  /* ────────── Batch‑update helpers (programmatic edits) ───────────── */
  /**
   * Begins a batch update.
   */
  public beginBatchUpdate() {
    this.suppressRender = true;
  }

  /**
   * Ends a batch update.
   */
  public endBatchUpdate() {
    this.suppressRender = false;
    this.scheduleRender();
  }

  /**
   * Sets the value of a cell.
   * @param row the row of the cell
   * @param col the column of the cell
   * @param value the value to set
   */
  public setCellValue(row: number, col: number, value: string): void {
    if (value.trim() === "") return;
    const cell = this.getCell(row, col);
    cell.setValue(value);
    if (!this.suppressRender) this.scheduleRender();
  }

  /**
   * Draws a header.
   * @param index the index of the header
   * @param isColumn true if the header is a column header, false if it is a row header
   * @param pos the position of the header
   * @param size the size of the header
   */
  private drawHeader(
    index: number,
    isColumn: boolean,
    pos: number,
    size: number
  ): void {
    const ctx = this.ctx;
    const label = isColumn ? this.columnName(index) : (index + 1).toString();
    // Smoothly animate rowHeaderWidth to the desired width instead of snapping
    if (!isColumn) {
      const desiredWidth = ctx.measureText(label).width + 16;
      const defaultWidth = 40;
      const targetWidth = Math.max(desiredWidth, defaultWidth);
      const step = 5; // change this to control speed

      if (this.rowHeaderWidth < targetWidth) {
        this.rowHeaderWidth = Math.min(this.rowHeaderWidth + step, targetWidth);
      } else if (this.rowHeaderWidth > targetWidth) {
        this.rowHeaderWidth = Math.max(this.rowHeaderWidth - step, targetWidth);
      }
    }

    const x = isColumn ? pos : 0;
    const y = isColumn ? 0 : pos;
    let w = isColumn ? size : this.rowHeaderWidth;
    const h = isColumn ? HEADER_SIZE : size;
    ctx.font = "14px Calibri, 'Segoe UI', sans-serif";

    // Dynamically adjust row header width for large row numbers
    if (!isColumn) {
      const rowLabel = (index + 1).toString();
      const textWidth = ctx.measureText(rowLabel).width;
      const padding = 16;
      w = Math.max(this.rowHeaderWidth, textWidth + padding);
    }

    // Get selection states
    const selectedCell = this.selMgr.getSelectedCell();
    const selectedRow = this.selMgr.getSelectedRow();
    const selectedCol = this.selMgr.getSelectedCol();
    const dragRect = this.selMgr.getDragRect();

    // Determine highlight state
    let highlight = false;
    let highlightColor = "#CAEAD8";
    let highlightText = "#107C41";
    let isBold = false;

    // Check various selection conditions
    if (
      selectedCell &&
      ((isColumn && selectedCell.col === index) ||
        (!isColumn && selectedCell.row === index))
    ) {
      highlight = true;
    }
    if (
      (isColumn && selectedCol === index) ||
      (!isColumn && selectedRow === index)
    ) {
      highlight = true;
    }
    if (
      (isColumn && selectedRow !== null) ||
      (!isColumn && this.selMgr.getSelectedColumns().length > 0)
    ) {
      highlight = true;
    }
    if (
      (!isColumn && selectedRow === index) ||
      (isColumn && selectedCol === index)
    ) {
      highlight = true;
      highlightColor = "#107C41";
      highlightText = "#FFFFFF";
      isBold = true;
    }
    if (
      (this.selMgr.getSelectedColumns().includes(index) && isColumn) ||
      (this.selMgr.getSelectedRows().includes(index) && !isColumn)
    ) {
      highlight = true;
      highlightColor = "#107C41";
      highlightText = "#FFFFFF";
      isBold = true;
      if (!isColumn) {
      }
    }

    if (
      (!isColumn && selectedCol !== null) ||
      (isColumn && this.selMgr.getSelectedRows().length > 0)
    ) {
      highlight = true;
    }
    this.ctx.fillStyle = "#f3f6fb";
    this.ctx.fillRect(0, 0, this.rowHeaderWidth, HEADER_SIZE);
    this.ctx.strokeStyle = "#d4d4d4";
    this.ctx.lineWidth = 1 / dpr;
    this.ctx.strokeRect(0, 0, this.rowHeaderWidth, HEADER_SIZE);
    // Check drag selection
    if (dragRect) {
      const inRange = isColumn
        ? index >= dragRect.startCol && index <= dragRect.endCol
        : index >= dragRect.startRow && index <= dragRect.endRow;
      if (inRange) {
        highlight = true;
      }
    }

    // Draw background
    if (highlight) {
      ctx.fillStyle = highlightColor;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.fillStyle = "#F5F5F5";
      ctx.fillRect(x, y, w, h);
    }

    // Draw borders
    ctx.strokeStyle = highlight ? "#107C41" : "#b7c6d5";
    ctx.lineWidth = highlight ? 2 / dpr : 1 / dpr; // Always 1px
    ctx.beginPath();

    if (isColumn) {
      // Bottom border
      ctx.moveTo(x + 0.5, y + h + 0.5);
      ctx.lineTo(x + w - 0.5, y + h + 0.5);
      if (!highlight) {
        // Left border
        ctx.moveTo(x + 0.5, y + 0.5);
        ctx.lineTo(x + 0.5, y + h + 0.5);
      }
    } else {
      // Right border
      ctx.moveTo(x + w - 0.5, y + 0.5);
      ctx.lineTo(x + w - 0.5, y + h - 0.5);
      if (!highlight) {
        // Bottom border
        ctx.moveTo(x + 0.5, y + h - 0.5);
        ctx.lineTo(x + w - 0.5, y + h - 0.5);
      }
    }
    ctx.stroke();

    // Draw text
    ctx.fillStyle = highlight ? highlightText : "#616161";
    if (isBold) {
      ctx.font = "bold 16px Calibri, 'Segoe UI', sans-serif";
    }

    ctx.textBaseline = "middle";

    if (isColumn) {
      ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y + h / 2);
    } else {
      ctx.textAlign = "right";
      ctx.fillText(label, x + w - 4, y + h / 2);
    }
  }
  /**
   * Gets the name of a column.
   * @param idx the index of the column
   * @returns the name of the column
   */
  private columnName(idx: number): string {
    let name = "";
    let n = idx;
    do {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return name;
  }

  /**
   * Counts the number of created cells.
   * @returns the number of created cells
   */
  public countCreatedCells(): number {
    let count = 0;
    for (const rowMap of this.cells.values()) {
      count += rowMap.size;
    }
    return count;
  }

  /**
   * Gets the mouse position relative to the entire scrollable grid area.
   * @param evt the mouse event
   * @returns the mouse position (x, y) including scroll offsets.
   */
  public getMousePos(evt: MouseEvent): { x: number; y: number } { // Made public
    const rect = this.canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left + this.container.scrollLeft;
    const y = evt.clientY - rect.top + this.container.scrollTop;
    return { x, y };
  }

  /**
   * Finds a column by offset relative to the data (scrollable) part of the grid.
   * @param offsetX the offset X from the start of the data columns.
   * @returns the column index and the pixel distance within that column.
   */
  public findColumnByOffset(offsetX: number): { col: number; within: number } { // Made public
    let x = 0;
    for (let c = 0; c < COLS; c++) { // COLS should ideally come from this.colMgr.getTotalColumns()
      const w = this.colMgr.getWidth(c);
      if (offsetX < x + w) return { col: c, within: offsetX - x };
      x += w;
    }
    return { col: COLS - 1, within: 0 }; // Or this.colMgr.getTotalColumns() - 1
  }

  /**
   * Finds a row by offset relative to the data (scrollable) part of the grid.
   * @param offsetY the offset Y from the start of the data rows.
   * @returns the row index and the pixel distance within that row.
   */
  public findRowByOffset(offsetY: number): { row: number; within: number } { // Made public
    let y = 0;
    for (let r = 0; r < ROWS; r++) { // ROWS should ideally come from this.rowMgr.getTotalRows()
      const h = this.rowMgr.getHeight(r);
      if (offsetY < y + h) return { row: r, within: offsetY - y };
      y += h;
    }
    return { row: ROWS - 1, within: 0 }; // Or this.rowMgr.getTotalRows() - 1
  }

  /**
   * Computes the selection stats.
   */
  public computeSelectionStats(): void { // Made public


    // Whole row selection
    const selectedRows = this.selMgr.getSelectedRows();
    if (selectedRows.length > 0) {
      // Select data from all columns of the selected rows
      const rowsData: (string | number)[][] = [];
      for (const rowIdx of selectedRows) {
        if (rowIdx !== null) {
          const row: (string | number)[] = [];
          for (let c = 0; c < COLS; c++) {
            row.push(this.getCellValueIfExists(rowIdx, c));
          }
          rowsData.push(row);
        }
      }
      if (rowsData.length > 0) {
        const stats = Aggregator.compute(rowsData);
        this.updateStatusBar(stats);
        return;
      }
    }
    // Multiple columns selection
    const selectedColumns = this.selMgr.getSelectedColumns();
    if (selectedColumns.length > 0) {
      // Ensure all selected columns are included, including the last one
      const minCol = Math.min(...selectedColumns);
      const maxCol = Math.max(...selectedColumns);
      const fullSelectedCols: number[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        if (selectedColumns.includes(c)) {
          fullSelectedCols.push(c);
        }
      }
      // For each row, collect values from all selected columns (including the last)
      const colsData: (string | number)[][] = [];
      for (let r = 0; r < ROWS; r++) {
        const row: (string | number)[] = [];
        for (const col of fullSelectedCols) {
          row.push(this.getCellValueIfExists(r, col));
        }
        colsData.push(row);
      }
      if (colsData.length > 0) {
        const stats = Aggregator.compute(colsData);
        this.updateStatusBar(stats);
        return;
      }
    }
    // Whole column selection
    const selectedCol = this.selMgr.getSelectedCol();
    if (selectedCol !== null) {
      const col: (string | number)[] = [];
      for (let r = 0; r < ROWS; r++) {
        col.push(this.getCellValueIfExists(r, selectedCol));
      }
      // Aggregator expects 2D array
      const stats = Aggregator.compute(col.map((v) => [v]));
      this.updateStatusBar(stats);
      return;
    }
    // Single cell selection
    const selectedCell = this.selMgr.getSelectedCell();
    if (selectedCell) {
      const { row, col } = selectedCell;
      const value = this.getCellValueIfExists(row, col);
      const stats = Aggregator.compute([[value]]);
      this.updateStatusBar(stats);
      return;
    }
    const rect = this.selMgr.getDragRect();
    if (rect) {
      // console.log("getSelectedCells drag rect:", rect);
      const { startRow, endRow, startCol, endCol } = rect;
      const cells: (string | number)[][] = [];
      for (let r = startRow; r <= endRow; r++) {
        const row: (string | number)[] = [];
        for (let c = startCol; c <= endCol; c++) {
          row.push(this.getCellValueIfExists(r, c));
        }
        cells.push(row);
      }
      const stats = Aggregator.compute(cells);
      this.updateStatusBar(stats);
      return;
    }
    // If nothing is selected, clear status bar
    this.updateStatusBar({ sum: "", count: "", average: "", min: "", max: "" });
  }

  /**
   * Updates the status bar.
   * @param stats the stats to update the status bar with
   */
  private updateStatusBar(stats: any): void {
    // TODO: Replace with real UI update
    const summaryBar = document.getElementById("summaryBar")!;
    summaryBar.innerHTML = ` <span><strong>SUM:</strong> ${stats.sum}</span>
      <span><strong>COUNT:</strong> ${stats.count}</span>
      <span><strong>AVERAGE:</strong> ${stats.average}</span>
      <span><strong>MIN:</strong> ${stats.min}</span>
      <span><strong>MAX:</strong> ${stats.max}</span>
      `;
  }

  /**
   * Handles the font size change.
   */
  private onFontSizeChange(): void {
    const fontSizeSelect = document.getElementById(
      "fontSizeSelect"
    ) as HTMLSelectElement;
    const newSize = parseInt(fontSizeSelect.value);
    this.applyFontSizeToSelection(newSize);
  }

  /**
   * Handles the bold toggle.
   */
  private onBoldToggle(): void {
    const boldBtn = document.getElementById("boldBtn")!;
    const isCurrentlyBold = boldBtn.classList.contains("active");
    this.applyBoldToSelection(!isCurrentlyBold);
  }

  /**
   * Handles the italic toggle.
   */
  private onItalicToggle(): void {
    const italicBtn = document.getElementById("italicBtn")!;
    const isCurrentlyItalic = italicBtn.classList.contains("active");
    this.applyItalicToSelection(!isCurrentlyItalic);
  }

  /**
   * Applies the font size to the selection.
   * @param newSize the new font size
   */
  private applyFontSizeToSelection(newSize: number): void {
    const selectedCells = this.getSelectedCells();
    if (selectedCells.length === 0) return;

    // Create and execute command for each selected cell
    const commands = selectedCells.map(
      (cell) => new FontSizeCommand(cell, newSize)
    );
    const composite = new CompositeCommand(commands);
    this.commandManager.execute(composite);

    this.scheduleRender();
  }

  /**
   * Applies the bold to the selection.
   * @param isBold true if the cells should be bold, false otherwise
   */
  private applyBoldToSelection(isBold: boolean): void {
    const selectedCells = this.getSelectedCells();
    if (selectedCells.length === 0) return;

    const commands = selectedCells.map((cell) => new BoldCommand(cell, isBold));
    const composite = new CompositeCommand(commands);
    this.commandManager.execute(composite);

    this.updateToolbarState();
    this.scheduleRender();
  }

  /**
   * Applies the italic to the selection.
   * @param isItalic true if the cells should be italic, false otherwise
   */
  private applyItalicToSelection(isItalic: boolean): void {
    const selectedCells = this.getSelectedCells();
    if (selectedCells.length === 0) return;

    // Create and execute command for each selected cell
    const commands = selectedCells.map(
      (cell) => new ItalicCommand(cell, isItalic)
    );
    const composite = new CompositeCommand(commands);
    this.commandManager.execute(composite);

    this.updateToolbarState();
    this.scheduleRender();
  }

  /**
   * Gets the selected cells.
   * @returns the selected cells
   */
  private getSelectedCells(): Cell[] {
    const cells: Cell[] = [];

    // Check for drag selection first

    // Check for selected columns array (for column header selections when not dragging)
    const selectedColumns = this.selMgr.getSelectedColumns();
    if (selectedColumns.length > 0) {
      // console.log("Selected columns from array:", selectedColumns);
      for (const col of selectedColumns) {
        for (let r = 0; r < ROWS; r++) {
          const cell = this.getCellIfExists(r, col);
          if (cell) cells.push(cell);
        }
      }
      return cells;
    }
    const selectedRows = this.selMgr.getSelectedRows();
    if (selectedRows.length > 0) {
      for (const row of selectedRows) {
        for (let c = 0; c < COLS; c++) {
          const cell = this.getCellIfExists(row, c);
          if (cell) cells.push(cell);
        }
      }
      return cells;
    }
    // Check for row selection
    const selectedRow = this.selMgr.getSelectedRow();
    if (selectedRow !== null) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.getCellIfExists(selectedRow, c);
        if (cell) cells.push(cell);
      }
      return cells;
    }

    // Check for column selection
    const selectedCol = this.selMgr.getSelectedCol();
    if (selectedCol !== null) {
      for (let r = 0; r < ROWS; r++) {
        const cell = this.getCellIfExists(r, selectedCol);
        if (cell) cells.push(cell);
      }
      return cells;
    }

    // Check for single cell selection
    const selectedCell = this.selMgr.getSelectedCell();
    if (selectedCell) {
      const cell = this.getCellIfExists(selectedCell.row, selectedCell.col);
      if (cell) cells.push(cell);
      return cells;
    }
    const rect = this.selMgr.getDragRect();
    if (rect) {
      for (let r = rect.startRow; r <= rect.endRow; r++) {
        for (let c = rect.startCol; c <= rect.endCol; c++) {
          const cell = this.getCellIfExists(r, c);
          if (cell) cells.push(cell);
        }
      }
      return cells;
    }
    return cells;
  }

  /**
   * Updates the toolbar state.
   */
  public updateToolbarState(): void { // Made public
    const selectedCells = this.getSelectedCells();
    if (selectedCells.length === 0) {
      // Reset toolbar to default state
      const fontSizeSelect = document.getElementById(
        "fontSizeSelect"
      ) as HTMLSelectElement;
      const boldBtn = document.getElementById("boldBtn")!;
      const italicBtn = document.getElementById("italicBtn")!;
      const alignLeftBtn = document.getElementById("alignLeftBtn");
      const alignCenterBtn = document.getElementById("alignCenterBtn");
      const alignRightBtn = document.getElementById("alignRightBtn");
      fontSizeSelect.value = "14";
      boldBtn.classList.remove("active");
      italicBtn.classList.remove("active");
      alignLeftBtn?.classList.remove("active");
      alignCenterBtn?.classList.remove("active");
      alignRightBtn?.classList.remove("active");
      return;
    }

    // Check if all selected cells have the same formatting
    const firstCell = selectedCells[0];
    const allSameSize = selectedCells.every(
      (cell) => cell.getFontSize() === firstCell.getFontSize()
    );
    const allSameBold = selectedCells.every(
      (cell) => cell.getIsBold() === firstCell.getIsBold()
    );
    const allSameItalic = selectedCells.every(
      (cell) => cell.getIsItalic() === firstCell.getIsItalic()
    );
    const allSameAlign = selectedCells.every(
      (cell) =>
        cell.getAlignment && cell.getAlignment() === firstCell.getAlignment()
    );

    // Update toolbar state
    const fontSizeSelect = document.getElementById(
      "fontSizeSelect"
    ) as HTMLSelectElement;
    const boldBtn = document.getElementById("boldBtn")!;
    const italicBtn = document.getElementById("italicBtn")!;
    const alignLeftBtn = document.getElementById("alignLeftBtn");
    const alignCenterBtn = document.getElementById("alignCenterBtn");
    const alignRightBtn = document.getElementById("alignRightBtn");

    if (allSameSize) {
      fontSizeSelect.value = firstCell.getFontSize().toString();
    } else {
      fontSizeSelect.value = "14"; // Default if mixed
    }

    if (allSameBold) {
      if (firstCell.getIsBold()) {
        boldBtn.classList.add("active");
      } else {
        boldBtn.classList.remove("active");
      }
    } else {
      boldBtn.classList.remove("active"); // Mixed state
    }

    if (allSameItalic) {
      if (firstCell.getIsItalic()) {
        italicBtn.classList.add("active");
      } else {
        italicBtn.classList.remove("active");
      }
    } else {
      italicBtn.classList.remove("active"); // Mixed state
    }

    if (allSameAlign) {
      alignLeftBtn?.classList.toggle(
        "active",
        firstCell.getAlignment() === "left"
      );
      alignCenterBtn?.classList.toggle(
        "active",
        firstCell.getAlignment() === "center"
      );
      alignRightBtn?.classList.toggle(
        "active",
        firstCell.getAlignment() === "right"
      );
    } else {
      alignLeftBtn?.classList.remove("active");
      alignCenterBtn?.classList.remove("active");
      alignRightBtn?.classList.remove("active");
    }
  }

  /**
   * Gets the cell object at the specified row and column, creating it if it doesn't exist.
   * Only use this for editing/import logic.
   * @param {number} row The row index.
   * @param {number} col The column index.
   * @returns {Cell} The cell object.
   */
  public getCell(row: number, col: number): Cell {
    let rowMap = this.cells.get(row);
    if (!rowMap) {
      rowMap = new Map();
      this.cells.set(row, rowMap);
    }
    if (!rowMap.has(col)) {
      rowMap.set(col, new Cell(row, col));
      // console.log("Cells created:", this.countCreatedCells());
    }
    return rowMap.get(col)!;
  }

  /**
   * Starts the marching ants animation for formula range highlighting.
   */
  private startMarchingAntsAnimation(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    const animate = () => {
      this.dashOffset += 1;
      this.scheduleRender();
      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  /**
   * Stops the marching ants animation.
   */
  private stopMarchingAntsAnimation(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.copyRange = null;

    this.scheduleRender();
  }

  /**
   * Cleanup method to stop animations and clear resources.
   */
  public destroy(): void {
    this.stopMarchingAntsAnimation();
    // Add any other cleanup needed
  }

  /**
   * Selects a cell and scrolls to it if needed.
   * @param row The row index
   * @param col The column index
   */
  public selectCellAndScroll(row: number, col: number): void {
    this.selMgr.selectCell(row, col);
    this.scrollToCell(row, col);
    this.scheduleRender();
    this.computeSelectionStats();
  }
  /**
   * Applies the alignment to the selection.
   * @param alignment the alignment to apply
   */
  private applyAlignmentToSelection(
    alignment: "left" | "center" | "right"
  ): void {
    const selectedCells = this.getSelectedCells();

    if (selectedCells.length === 0) return;
    // console.log('Applying alignment', alignment, 'to cells:', selectedCells.map(cell => ({row: cell.row, col: cell.col, current: cell.getAlignment()})));
    const commands = selectedCells.map(
      (cell) => new AlignmentCommand(cell, alignment)
    );
    const composite = new CompositeCommand(commands);
    this.commandManager.execute(composite);
    this.updateToolbarState();
    this.scheduleRender();
  }

  // Marching ants for copy and paste
  private copyRange: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null = null;
  // private pasteRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null = null;

  // Add this method to the class:
}
