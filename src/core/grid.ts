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
import { EventRouter } from '../handlers/EventRouter';
import { ColumnResizeHandler } from '../handlers/resize/ColumnResizeHandler';
import { RowResizeHandler } from '../handlers/resize/RowResizeHandler';
import { ColumnDragHandler } from '../handlers/drag/ColumnDragHandler'; // New
import { RowDragHandler } from '../handlers/drag/RowDragHandler';     // New
import { CellSelectHandler } from '../handlers/select/CellSelectHandler';
// Removed HeaderDragHandler and RowSelectHandler imports as they are replaced


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
export const HEADER_SIZE = 40; // Made exportable for handlers if they don't import Grid

/** How many pixels near an edge counts as a "resize hotspot" */
export const RESIZE_GUTTER = 5; // Made exportable for handlers
let dpr = window.devicePixelRatio || 1;
/**
 * @class Grid
 * @classdesc Manages rendering, selection, editing, and resizing of a spreadsheet-like canvas grid.
 * Supports virtual scrolling, cell editing, selection, and data import.
 */
export class Grid {
  /** @type {HTMLCanvasElement} The canvas element for rendering the grid. */
  public readonly canvas: HTMLCanvasElement;
  /** @type {CanvasRenderingContext2D} The 2D rendering context for the canvas. */
  private readonly ctx: CanvasRenderingContext2D;
  /** @type {RowManager} Manages row heights and operations. */
  public readonly rowMgr: RowManager;
  /** @type {ColumnManager} Manages column widths and operations. */
  public readonly colMgr: ColumnManager;
  /** @type {SelectionManager} Manages selection state and drawing. */
  public readonly selMgr: SelectionManager;
  /**@type {number} Specifies the width of the row Header that changes based on the label */
  public rowHeaderWidth: number = 40; // Made public for handlers
  /** @type {Map} cells which are map of maps  */
  public cells: Map<number, Map<number, Cell>> = new Map();
  /** @type {HTMLInputElement|null} The input element for cell editing. */
  private editorInput: HTMLInputElement | null = null;
  /** @type {{row: number, col: number}|null} The currently editing cell. */
  private editingCell: { row: number; col: number } | null = null;
  /** @type {HTMLElement} The scrollable container for the grid. */
  public container: HTMLElement; // Made public for handlers
  /** @type {boolean} Suppresses rendering during batch updates. */
  private suppressRender: boolean = false;
  /** @type {boolean} Whether a render is scheduled. */
  private renderScheduled: boolean = false;

  public commandManager: CommandManager = new CommandManager(); // Made public for handlers

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
  private editingCellInstance: Cell | null = null;

  /** @type {boolean} Whether the top-left box is hovered. */
  private _isTopLeftHovered: boolean = false; // This likely needs its own small hover handler or logic in EventRouter/Grid's pointermove

  /** @type {string[][]|null} The clipboard data. */
  private clipboard: string[][] | null = null;

  /** @type {number} The last render time. */
  private _lastRenderTime: number = 0;

  /** @type {{row: number, col: number}|null} The pending edit cell. */
  public pendingEditCell: { row: number; col: number } | null = null;

  private eventRouter: EventRouter;
  private columnResizeHandler: ColumnResizeHandler;
  private rowResizeHandler: RowResizeHandler;
  private columnDragHandler: ColumnDragHandler;
  private rowDragHandler: RowDragHandler;
  private cellSelectHandler: CellSelectHandler;

  /* ─────────────────────────────────────────────────────────────────── */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not supported");
    this.ctx = ctx;

    const containerEl = document.getElementById("canvas-container");
    if (!containerEl) throw new Error("Canvas container not found");
    this.container = containerEl;


    const filler = document.getElementById("scroll-filler");
    if (!filler) throw new Error("Scroll filler element not found");


    this.container.addEventListener("scroll", () => {
      this.updateEditorPosition();
      this.scheduleRender();
    });
    window.addEventListener("resize", () => {
      this.resizeCanvas();
    });

    this.rowMgr = new RowManager(ROWS, DEFAULT_ROW_HEIGHT);
    this.colMgr = new ColumnManager(COLS, DEFAULT_COL_WIDTH);
    this.selMgr = new SelectionManager(this);
    const virtualHeight = this.rowMgr.getTotalHeight();
    const virtualWidth = this.colMgr.getTotalWidth();
    filler.style.height = virtualHeight + "px";
    filler.style.width = virtualWidth + "px";
    this.canvas.style.cursor ="cell";

    this.columnResizeHandler = new ColumnResizeHandler(this);
    this.rowResizeHandler = new RowResizeHandler(this);
    this.columnDragHandler = new ColumnDragHandler(this);
    this.rowDragHandler = new RowDragHandler(this);
    this.cellSelectHandler = new CellSelectHandler(this);

    this.eventRouter = new EventRouter([
      this.columnResizeHandler, // Highest priority for small gutter targets
      this.rowResizeHandler,    // Same as above
      this.columnDragHandler,
      this.rowDragHandler,
      this.cellSelectHandler, // General cell interaction last
    ], this);

    this.addEventListeners();
    this.resizeCanvas();

    window.addEventListener("blur", () => {
      this.stopMarchingAntsAnimation();
    });
  }

  private resizeCanvas(): void {
    dpr = window.devicePixelRatio || 1;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.updateEditorPosition();
    this.scheduleRender();
  }

  public scheduleRender(): void {
    if (this.renderScheduled || this.suppressRender) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.render();
      this.renderScheduled = false;
    });
  }

  private getCellIfExists(row: number, col: number): Cell | null {
    const rowMap = this.cells.get(row);
    if (!rowMap) return null;
    return rowMap.get(col) || null;
  }

  private getCellValueIfExists(row: number, col: number): string {
    const rowMap = this.cells.get(row);
    if (!rowMap) return "";
    const cell = rowMap.get(col);
    return cell ? cell.getValue() : "";
  }

  private addEventListeners(): void {
    this.canvas.addEventListener('pointerdown', (evt) => this.eventRouter.onPointerDown(evt as MouseEvent));
    this.canvas.addEventListener('pointermove', (evt) => this.eventRouter.onPointerMove(evt as MouseEvent));
    window.addEventListener('pointermove', (evt) => this.eventRouter.onPointerDrag(evt as MouseEvent));
    window.addEventListener('pointerup', (evt) => this.eventRouter.onPointerUp(evt as MouseEvent));

    window.addEventListener("keydown", this.onKeyDown.bind(this));
    // Other listeners (buttons, search, etc.)
    const undoButton = document.getElementById("undoBtn");
    if(undoButton) undoButton.addEventListener("click", this.onUndo.bind(this));
    const redoButton = document.getElementById("redoBtn");
    if(redoButton) redoButton.addEventListener("click", this.onRedo.bind(this));
    this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this) )

    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener("input", () => this.searchCell(searchInput.value));
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); this.navigateSearchResults("next"); }
        else if (e.key === "Escape") { searchInput.value = ""; this.clearSearch(); searchInput.blur(); }
      });
    }
    // ... (other button listeners from original code) ...
    const insertRowBtn = document.getElementById("insertRowBtn");
    if(insertRowBtn) insertRowBtn.addEventListener("click", this.onInsertRow.bind(this));
    const insertColBtn = document.getElementById("insertColBtn");
    if(insertColBtn) insertColBtn.addEventListener("click", this.onInsertColumn.bind(this));
    const deleteRowBtn = document.getElementById("deleteRowBtn");
    if(deleteRowBtn) deleteRowBtn.addEventListener("click", this.onDeleteRow.bind(this));
    const deleteColBtn = document.getElementById("deleteColBtn");
    if(deleteColBtn) deleteColBtn.addEventListener("click", this.onDeleteColumn.bind(this));

    const fontSizeSelect = document.getElementById("fontSizeSelect") as HTMLSelectElement;
    if(fontSizeSelect) fontSizeSelect.addEventListener("change", this.onFontSizeChange.bind(this));
    const boldBtn = document.getElementById("boldBtn");
    if(boldBtn) boldBtn.addEventListener("click", this.onBoldToggle.bind(this));
    const italicBtn = document.getElementById("italicBtn");
    if(italicBtn) italicBtn.addEventListener("click", this.onItalicToggle.bind(this));

    const alignLeftBtn = document.getElementById("alignLeftBtn");
    if (alignLeftBtn) alignLeftBtn.addEventListener("click", () => this.applyAlignmentToSelection("left"));
    const alignCenterBtn = document.getElementById("alignCenterBtn");
    if (alignCenterBtn) alignCenterBtn.addEventListener("click", () => this.applyAlignmentToSelection("center"));
    const alignRightBtn = document.getElementById("alignRightBtn");
    if (alignRightBtn) alignRightBtn.addEventListener("click", () => this.applyAlignmentToSelection("right"));
  }

  public isEditing(): boolean {
    return this.editingCell !== null && this.editorInput !== null && this.editorInput.style.display !== 'none';
  }

  private onUndo(): void { this.commandManager.undo(); this.scheduleRender(); }
  private onRedo(): void { this.commandManager.redo(); this.scheduleRender(); }

  private onInsertRow(): void {
    const selectedRow = this.selMgr.getSelectedRow();
    const selectedCell = this.selMgr.getSelectedCell();
    const insertAt = selectedRow !== null ? selectedRow : selectedCell ? selectedCell.row : 0;
    const command = new InsertRowCommand(this, insertAt);
    this.commandManager.execute(command);
    this.scheduleRender();
  }

  private onInsertColumn(): void {
    const selectedCol = this.selMgr.getSelectedCol();
    const selectedCell = this.selMgr.getSelectedCell();
    const insertAt = selectedCol !== null ? selectedCol : selectedCell ? selectedCell.col : 0;
    const command = new InsertColumnCommand(this, insertAt);
    this.commandManager.execute(command);
    this.scheduleRender();
  }

  private onDeleteRow(): void {
    const selectedRow = this.selMgr.getSelectedRow();
    if (selectedRow === null) return;
    const confirmed = confirm(`Are you sure you want to delete row ${selectedRow + 1}?`);
    if (!confirmed) return;
    if (selectedRow >= 0 && selectedRow < ROWS) {
      const command = new DeleteRowCommand(this, selectedRow);
      this.commandManager.execute(command);
      this.selMgr.clearSelection();
      this.scheduleRender();
    }
  }

  private onDeleteColumn(): void {
    const selectedCol = this.selMgr.getSelectedCol();
    if (selectedCol === null) return;
    const deleteAt = selectedCol;
    const confirmed = confirm(`Are you sure you want to delete column ${this.columnName(deleteAt)}?`);
    if (!confirmed) return;
    if (deleteAt >= 0 && deleteAt < COLS) {
      const command = new DeleteColumnCommand(this, deleteAt);
      this.commandManager.execute(command);
      this.selMgr.clearSelection();
      this.scheduleRender();
    }
  }

  public shiftCellsDown(insertAt: number): void {
    for (let row = ROWS - 2; row >= insertAt; row--) {
      const rowMap = this.cells.get(row);
      if (rowMap) {
        const newRowMap = new Map();
        for (const [col, cell] of rowMap) {
          const newCell = new Cell(row + 1, col, cell.getRawValue());
          newCell.copyStyleFrom(cell);
          newRowMap.set(col, newCell);
        }
        this.cells.set(row + 1, newRowMap);
      } else {
         this.cells.delete(row + 1);
      }
    }
    this.cells.set(insertAt, new Map());
  }

  public shiftCellsRight(insertAt: number): void {
    for (const [rowIndex, rowMap] of this.cells.entries()) {
      const colsToShift = Array.from(rowMap.keys()).filter((col) => col >= insertAt).sort((a, b) => b - a);
      for (const col of colsToShift) {
        const cell = rowMap.get(col)!;
        const newCell = new Cell(rowIndex, col + 1, cell.getRawValue());
        newCell.copyStyleFrom(cell);
        rowMap.set(col + 1, newCell);
        rowMap.delete(col); // Delete old cell after shifting
      }
      // Ensure the cell AT insertAt is cleared if it wasn't shifted (i.e., column was empty at insertAt)
      // This is handled by the loop above: if rowMap.get(insertAt) existed, it was moved.
      // If we are inserting a truly blank column, this is fine.
      // If the intent was to clear the column at insertAt after values are shifted out,
      // we might need an explicit rowMap.delete(insertAt) if it still exists and wasn't shifted.
      // However, the current logic shifts content from insertAt rightwards, so insertAt itself becomes "empty"
      // by virtue of its original content moving.
    }
  }


  public shiftCellsUp(deleteAt: number): void {
    for (let row = deleteAt; row < ROWS - 1; row++) {
      const nextRowMap = this.cells.get(row + 1);
      if (nextRowMap) {
        const currentRowMap = new Map();
        for (const [col, cell] of nextRowMap) {
          const newCell = new Cell(row, col, cell.getRawValue());
          newCell.copyStyleFrom(cell);
          currentRowMap.set(col, newCell);
        }
        this.cells.set(row, currentRowMap);
      } else {
        this.cells.delete(row);
      }
    }
    this.cells.delete(ROWS - 1);
  }

  public shiftCellsLeft(deleteAt: number): void {
    for (const [rowIndex, rowMap] of this.cells.entries()) {
      rowMap.delete(deleteAt);
      const colsToShift = Array.from(rowMap.keys()).filter((col) => col > deleteAt).sort((a, b) => a - b);
      for (const col of colsToShift) {
        const cell = rowMap.get(col)!;
        const newCell = new Cell(rowIndex, col - 1, cell.getRawValue());
        newCell.copyStyleFrom(cell);
        rowMap.set(col - 1, newCell);
        rowMap.delete(col);
      }
    }
  }

  private onDoubleClick(evt: MouseEvent): void {
    const { mouseX, mouseY } = this.getMouseCanvasCoordinates(evt);
    if (mouseX < this.rowHeaderWidth || mouseY < HEADER_SIZE) return;

    const { x: worldX, y: worldY } = this.getMousePos(evt);
    const { col } = this.findColumnByOffset(worldX - this.rowHeaderWidth);
    const { row } = this.findRowByOffset(worldY - HEADER_SIZE);

    this.pendingEditCell = { row, col };
    this.startEditingCell(row, col);
  }

  private getMouseCanvasCoordinates(event: MouseEvent): { mouseX: number, mouseY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    return { mouseX, mouseY };
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.getAttribute("contenteditable") === "true") && target !== this.editorInput) {
      return; // Ignore if focus is on some other input, but allow for our editorInput
    }

    if (this.isEditing() && e.target === this.editorInput) {
        // Let editorInput's keydown handler manage Enter, Escape, Tab
        if (e.key === "Enter" || e.key === "Escape" || e.key === "Tab") {
            // Handled by editorInput's listener
            return;
        }
        // For other keys, let the input field process them.
        return;
    }


    // --- Clipboard Operations ---
    if (e.ctrlKey && e.key === "c") {
      // ... (clipboard logic as before, ensure getSelectedCells is robust)
      // Simplified: uses selMgr.getPrimarySelectionRange() which needs to be implemented in selMgr
      const selectionRange = this.selMgr.getPrimarySelectionRange(); // Assumes selMgr can provide this
      if (selectionRange) {
          this.copyRange = selectionRange;
          this.startMarchingAntsAnimation();
          const clipboardData: string[][] = [];
          for (let r = selectionRange.startRow; r <= selectionRange.endRow; r++) {
              const rowArray: string[] = [];
              for (let c = selectionRange.startCol; c <= selectionRange.endCol; c++) {
                  const cell = this.getCellIfExists(r, c);
                  rowArray.push(cell ? cell.getRawValue() : "");
              }
              clipboardData.push(rowArray);
          }
          this.clipboard = clipboardData;
          this.formulaRange = null; // Clear formula highlight on copy
      }
      this.scheduleRender();
      e.preventDefault(); return;
    }
    if (e.ctrlKey && e.key === "v") {
      const primaryCell = this.selMgr.getSelectedCell() || this.pendingEditCell;
      if (!primaryCell || !this.clipboard) { e.preventDefault(); return; }
      const { row, col } = primaryCell;
      const clipboardManager = new ClipboardManager();
      clipboardManager.setData(this.clipboard);
      const command = new PasteCommand(row, col, this, clipboardManager);
      this.commandManager.execute(command);
      this.copyRange = null;
      this.formulaRange = null;
      this.scheduleRender();
      e.preventDefault(); return;
    }

    // --- Navigation & Selection (Simplified - full keyboard handling is complex) ---
    const currentSelection = this.selMgr.getSelectedCell() || this.pendingEditCell;
    if (!this.isEditing() && currentSelection) {
        let { row, col } = currentSelection;
        let newRow = row, newCol = col;
        let moved = false;

        if (e.key === "ArrowRight") { if (col < COLS - 1) { newCol++; moved = true; } }
        else if (e.key === "ArrowLeft") { if (col > 0) { newCol--; moved = true; } }
        else if (e.key === "ArrowDown") { if (row < ROWS - 1) { newRow++; moved = true; } }
        else if (e.key === "ArrowUp") { if (row > 0) { newRow--; moved = true; } }

        if (moved) {
            e.preventDefault();
            if (e.shiftKey) { // Extend selection
                if (!this.selMgr.isDragging()) {
                    this.selMgr.startDrag(row, col); // Anchor at current cell
                }
                this.selMgr.updateDrag(newRow, newCol);
            } else { // Move selection
                this.selMgr.clearSelection();
                this.selMgr.selectCell(newRow, newCol);
                this.pendingEditCell = {row: newRow, col: newCol};
            }
            this.scrollToCell(newRow, newCol);
            this.scheduleRender();
            this.computeSelectionStats();
            this.updateToolbarState();
            return;
        }
    }

    // --- Other Keyboard Actions ---
    if (e.ctrlKey && e.key === "a") { e.preventDefault(); this.selMgr.selectAll(); this.pendingEditCell = {row:0, col:0}; this.scheduleRender(); this.computeSelectionStats(); this.updateToolbarState(); return; }
    if (e.ctrlKey && e.key === "b" && !this.isEditing()) { e.preventDefault(); this.onBoldToggle(); return; }
    if (e.ctrlKey && e.key === "i" && !this.isEditing()) { e.preventDefault(); this.onItalicToggle(); return; }

    if ((e.key === "Backspace" || e.key === "Delete") && !this.isEditing()) {
      e.preventDefault();
      const cellsToClear = this.getSelectedCellsForFormatting();
      if (cellsToClear.length > 0) {
          const commands = cellsToClear.map(cell => new EditCellCommand(this, cell, cell.getRawValue(), ""));
          const composite = new CompositeCommand(commands);
          this.commandManager.execute(composite);
          this.scheduleRender(); // To show cleared cells
          this.computeSelectionStats(); // Update stats
      }
      // Note: Does not delete rows/columns here, only cell content.
      return;
    }

    if (e.ctrlKey && e.key === "z") { e.preventDefault(); this.onUndo(); return; }
    if (e.ctrlKey && e.key === "y") { e.preventDefault(); this.onRedo(); return; }

    // Start editing on typing
    const focusCell = this.pendingEditCell || this.selMgr.getSelectedCell();
    if (focusCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !this.isEditing()) {
      e.preventDefault();
      this.startEditingCell(focusCell.row, focusCell.col, e.key);
      return;
    }

    // Enter to start editing focused cell
    if (e.key === "Enter" && !this.isEditing() && focusCell) {
        e.preventDefault();
        this.startEditingCell(focusCell.row, focusCell.col);
        return;
    }
    // Escape to clear pending edit cell or selection
    if (e.key === "Escape" && !this.isEditing()) {
        e.preventDefault();
        if (this.pendingEditCell || this.selMgr.hasSelection()) {
            this.pendingEditCell = null;
            this.selMgr.clearSelection();
            this.scheduleRender();
            this.computeSelectionStats();
            this.updateToolbarState();
        }
        return;
    }
  }


  public startEditingCell(row: number, col: number, initialValue?: string): void {
    const cell = this.getCell(row, col);
    this.editingCellInstance = cell;

    if (!this.editorInput) this.createEditorInput();

    const cellRawValue = cell.getRawValue();
    if (Cell.isFormula(cellRawValue)) {
      this.formulaRange = this.extractRangeFromFormula(cellRawValue);
      if(this.formulaRange) this.startMarchingAntsAnimation(); else this.stopMarchingAntsAnimation();
    } else {
      this.formulaRange = null;
      this.stopMarchingAntsAnimation();
    }

    this.pendingEditCell = null;
    this.editingCell = { row, col };

    if (typeof initialValue === "string") {
      this.editorInput!.value = initialValue;
    } else {
      this.editorInput!.value = cellRawValue; // Edit raw value (formula or text)
    }

    this.updateEditorPosition(); // Position and style editor
    this.editorInput!.style.display = 'block';
    this.editorInput!.focus();

    const valLength = this.editorInput!.value.length;
    if (typeof initialValue === "string") { // Cursor after initial char
      this.editorInput!.setSelectionRange(initialValue.length, initialValue.length);
    } else { // Cursor at end
      this.editorInput!.setSelectionRange(valLength, valLength);
    }
    this.scheduleRender(); // Re-render to hide cell text under editor
  }

  private createEditorInput(): void {
    this.editorInput = document.createElement("input");
    this.editorInput.className = "cell-editor";
    this.editorInput.type = "text";
    this.editorInput.style.position = 'absolute';
    this.editorInput.style.border = "none";
    this.editorInput.style.outline = "2px solid #107C41";
    this.editorInput.style.boxSizing = "border-box";
    this.editorInput.style.backgroundColor = "#fff";
    // Font, padding, etc., will be set in updateEditorPosition based on cell style
    this.container.appendChild(this.editorInput);

    this.editorInput.addEventListener("blur", () => {
        if (this.isEditing()) {
            this.finishEditing(true);
        }
    });
    this.editorInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.finishEditing(true);
        const {row, col} = this.editingCell!;
        if (!e.shiftKey && row < ROWS - 1) {
            this.selMgr.selectCell(row + 1, col);
            this.startEditingCell(row + 1, col);
        } else if (e.shiftKey && row > 0) { // Shift+Enter moves up
            this.selMgr.selectCell(row - 1, col);
            this.startEditingCell(row - 1, col);
        } else { this.canvas.focus(); }
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.finishEditing(false); // false: revert to original value
        this.canvas.focus();
      } else if (e.key === "Tab") {
        e.preventDefault();
        this.finishEditing(true);
        const {row, col} = this.editingCell!;
        if (!e.shiftKey && col < COLS - 1) {
            this.selMgr.selectCell(row, col + 1); this.startEditingCell(row, col + 1);
        } else if (e.shiftKey && col > 0) {
            this.selMgr.selectCell(row, col - 1); this.startEditingCell(row, col - 1);
        } else if (!e.shiftKey && col === COLS -1 && row < ROWS -1 ) { // Tab from last cell in row
            this.selMgr.selectCell(row+1, 0); this.startEditingCell(row+1, 0);
        } else if (e.shiftKey && col === 0 && row > 0) { // Shift+Tab from first cell in row
            this.selMgr.selectCell(row-1, COLS-1); this.startEditingCell(row-1, COLS-1);
        }
         else { this.canvas.focus(); }
      }
    });

    this.editorInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const value = target.value;
      if (value.startsWith("=")) {
        this.formulaRange = this.extractRangeFromFormula(value);
        if(this.formulaRange) this.startMarchingAntsAnimation(); else this.stopMarchingAntsAnimation();
      } else {
        this.formulaRange = null;
        this.stopMarchingAntsAnimation();
      }
    });
  }

  private extractRangeFromFormula(formula: string): { startRow: number; startCol: number; endRow: number; endCol: number; } | null {
    const cleanFormula = formula.startsWith("=") ? formula.substring(1) : formula;
    // Regex for simple SUM(A1:B2) or A1:B2 or A1
    const rangeRegex = /(?:([A-Z]+[0-9]+):([A-Z]+[0-9]+))|([A-Z]+[0-9]+)/i;
    // Try to find a function call, e.g., SUM(A1:B5)
    const funcMatch = cleanFormula.match(/\w+\(([^)]+)\)/i);
    const contentToParse = funcMatch ? funcMatch[1] : cleanFormula; // Parse content inside function or whole formula

    const match = contentToParse.match(rangeRegex);
    if (!match) return null;

    try {
        if (match[1] && match[2]) { // A1:B2 part
            const { row: startRow, col: startCol } = getCoordinates(match[1]);
            const { row: endRow, col: endCol } = getCoordinates(match[2]);
            return {
                startRow: Math.min(startRow, endRow),
                startCol: Math.min(startCol, endCol),
                endRow: Math.max(startRow, endRow),
                endCol: Math.max(startCol, endCol)
            };
        } else if (match[3]) { // A1 part
            const { row, col } = getCoordinates(match[3]);
            return { startRow: row, startCol: col, endRow: row, endCol: col };
        }
    } catch { return null; }
    return null;
  }

  // Search methods (currentSearchResults, clearSearch, navigateSearchResults, updateSearchStatus, searchCell) remain largely the same.
  private searchCell(searchTerm: string): void {
    if (!searchTerm.trim()) { this.clearSearch(); return; }
    const searchResults: { row: number; col: number; value: string }[] = [];
    const term = searchTerm.toLowerCase();
    this.cells.forEach((rowMap, r) => {
        rowMap.forEach((cell, c) => {
            if (cell.getValue().toLowerCase().includes(term)) {
                searchResults.push({row: r, col: c, value: cell.getValue()});
            }
        });
    });

    if (searchResults.length > 0) {
      const firstMatch = searchResults[0];
      this.selMgr.clearSelection(); // Clear previous before selecting search result
      this.selMgr.selectCell(firstMatch.row, firstMatch.col);
      this.pendingEditCell = {row: firstMatch.row, col: firstMatch.col};
      this.currentSearchResults = searchResults;
      this.currentSearchIndex = 0;
      this.updateSearchStatus(searchResults.length, this.currentSearchIndex + 1);
      this.scrollToCell(firstMatch.row, firstMatch.col);
    } else {
      this.updateSearchStatus(0, 0);
      this.currentSearchResults = []; // Clear results
    }
    this.scheduleRender();
  }

  private currentSearchResults: { row: number; col: number; value: string }[] = [];
  private currentSearchIndex: number = 0;

  private clearSearch(): void {
    this.currentSearchResults = [];
    this.currentSearchIndex = 0;
    this.updateSearchStatus(0, 0);
    // Optionally clear selection or revert to previous: this.selMgr.clearSelection();
    this.scheduleRender();
  }

  private navigateSearchResults(direction: "next" | "prev"): void {
    if (this.currentSearchResults.length === 0) return;
    if (direction === "next") {
      this.currentSearchIndex = (this.currentSearchIndex + 1) % this.currentSearchResults.length;
    } else {
      this.currentSearchIndex = (this.currentSearchIndex - 1 + this.currentSearchResults.length) % this.currentSearchResults.length;
    }
    const match = this.currentSearchResults[this.currentSearchIndex];
    this.selMgr.clearSelection();
    this.selMgr.selectCell(match.row, match.col);
    this.pendingEditCell = {row: match.row, col: match.col};
    this.scrollToCell(match.row, match.col);
    this.updateSearchStatus(this.currentSearchResults.length, this.currentSearchIndex + 1);
    this.scheduleRender();
  }

  private updateSearchStatus(totalMatches: number, currentMatch: number): void {
    const searchStatus = document.getElementById("searchStatus");
    if (searchStatus) {
      if (totalMatches === 0 && (document.getElementById("searchInput") as HTMLInputElement)?.value.trim() !== "") {
          searchStatus.textContent = "No matches found"; searchStatus.style.color = "#d32f2f";
      } else if (totalMatches > 0) {
          searchStatus.textContent = `${currentMatch} of ${totalMatches} matches`; searchStatus.style.color = "#1976d2";
      } else {
          searchStatus.textContent = ""; // Clear if input is empty
      }
    }
  }


  public scrollToCell(row: number, col: number): void {
    const cellX = this.colMgr.getX(col);
    const cellY = this.rowMgr.getY(row);
    const cellWidth = this.colMgr.getWidth(col);
    const cellHeight = this.rowMgr.getHeight(row);

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const visibleWidth = containerWidth - this.rowHeaderWidth;
    const visibleHeight = containerHeight - HEADER_SIZE;

    let targetScrollX = this.container.scrollLeft;
    let targetScrollY = this.container.scrollTop;

    // Horizontal scroll adjustment
    if (cellX < this.container.scrollLeft) { // Cell is to the left of viewport
        targetScrollX = cellX;
    } else if (cellX + cellWidth > this.container.scrollLeft + visibleWidth) { // Cell is to the right
        targetScrollX = cellX + cellWidth - visibleWidth;
    }

    // Vertical scroll adjustment
    if (cellY < this.container.scrollTop) { // Cell is above viewport
        targetScrollY = cellY;
    } else if (cellY + cellHeight > this.container.scrollTop + visibleHeight) { // Cell is below
        targetScrollY = cellY + cellHeight - visibleHeight;
    }

    targetScrollX = Math.max(0, Math.min(targetScrollX, this.colMgr.getTotalWidth() - visibleWidth));
    targetScrollY = Math.max(0, Math.min(targetScrollY, this.rowMgr.getTotalHeight() - visibleHeight));

    if (Math.abs(targetScrollX - this.container.scrollLeft) > 1 || Math.abs(targetScrollY - this.container.scrollTop) > 1) {
      this.container.scrollTo({ left: targetScrollX, top: targetScrollY, behavior: "smooth" }); // Smooth scroll
    }
  }

  public drawMarchingAnts(startRow: number, startCol: number, endRow: number, endCol: number, color: string = "#217346"): void {
    const x1 = this.rowHeaderWidth + this.colMgr.getX(startCol) - this.container.scrollLeft;
    const y1 = HEADER_SIZE + this.rowMgr.getY(startRow) - this.container.scrollTop;
    const x2 = this.rowHeaderWidth + this.colMgr.getX(endCol) + this.colMgr.getWidth(endCol) - this.container.scrollLeft;
    const y2 = HEADER_SIZE + this.rowMgr.getY(endRow) + this.rowMgr.getHeight(endRow) - this.container.scrollTop;

    this.ctx.save();
    this.ctx.lineWidth = 2 / dpr;
    this.ctx.setLineDash([4, 4]);

    this.ctx.strokeStyle = color;
    this.ctx.lineDashOffset = -this.dashOffset;
    // Ensure rect is at least 1x1 to be visible
    const rectWidth = Math.max(1, x2 - x1);
    const rectHeight = Math.max(1, y2 - y1);
    this.ctx.strokeRect(x1 + 0.5, y1 + 0.5, rectWidth -1, rectHeight -1); // -1 to keep inside bounds

    this.ctx.restore();
  }

  public updateEditorPosition(): void {
    if (!this.editingCell || !this.editorInput) {
        if (this.editorInput) this.editorInput.style.display = 'none';
        return;
    }
    if (this.editorInput.style.display === 'none' && this.isEditing()) { // Ensure visible if supposed to be editing
        this.editorInput.style.display = 'block';
    }

    const { row, col } = this.editingCell;
    const scrollX = this.container.scrollLeft;
    const scrollY = this.container.scrollTop;
    const cell = this.getCell(row, col); // Get cell for style info

    const left = (this.rowHeaderWidth + this.colMgr.getX(col) - scrollX);
    const top = (HEADER_SIZE + this.rowMgr.getY(row) - scrollY);

    const cellStyle = window.getComputedStyle(this.canvas); // Fallback font
    const editorFontSize = cell.getFontSize();
    const editorFontFamily = cellStyle.fontFamily || 'Arial, sans-serif';
    const editorFontWeight = cell.getIsBold() ? 'bold' : 'normal';
    const editorFontStyle = cell.getIsItalic() ? 'italic' : 'normal';
    const editorFontColor = cell.getFontColor();

    let effectiveAlignment = cell.getAlignment() || (this.isNumericValue(cell.getRawValue()) ? "right" : "left");

    Object.assign(this.editorInput.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${this.colMgr.getWidth(col)}px`,
      height: `${this.rowMgr.getHeight(row)}px`,
      zIndex: "10",
      paddingLeft: effectiveAlignment === 'right' ? '0px' : '7px',
      paddingRight: effectiveAlignment === 'left' ? '0px' : '8px',
      paddingTop: '0px',
      paddingBottom: "0px",
      lineHeight: `${this.rowMgr.getHeight(row)}px`,
      textAlign: effectiveAlignment,
      fontFamily: editorFontFamily,
      fontSize: `${editorFontSize}px`,
      fontWeight: editorFontWeight,
      fontStyle: editorFontStyle,
      color: editorFontColor,
    });
  }

  public finishEditing(commit: boolean): void {
    if (!this.isEditing() || !this.editingCellInstance) return; // Already checked isEditing, but good guard

    const cell = this.editingCellInstance;
    const oldValue = cell.getRawValue();
    const newValueFromInput = this.editorInput!.value; // editorInput is checked by isEditing

    if (commit) {
      if (newValueFromInput !== oldValue) { // Only commit if value changed
         const command = new EditCellCommand(this, cell, oldValue, newValueFromInput);
         this.commandManager.execute(command); // This command should handle formula parsing and setting value
      }
    } else { // Revert: set editor input back to original value if needed, or just hide
        this.editorInput!.value = oldValue; // Visually revert if user Escapes
    }

    this.formulaRange = null;
    this.stopMarchingAntsAnimation();

    this.editorInput!.style.display = "none";
    const lastEditingCell = this.editingCell; // Store before nulling
    this.editingCell = null;
    this.editingCellInstance = null;
    this.scheduleRender();

    // Focus management: if committed with Enter, focus might move. Otherwise, canvas.
    // This is handled by the editorInput's keydown listener.
    // If blur caused commit, focus is already elsewhere.
    // If Escape, focus canvas.
    if (!commit && lastEditingCell) { // If Escape, select the cell that was being edited
        this.selMgr.selectCell(lastEditingCell.row, lastEditingCell.col);
        this.pendingEditCell = {row: lastEditingCell.row, col: lastEditingCell.col};
    }
  }

  private evaluateCellFormula(cell: Cell): string {
    const formula = cell.getFormula(); // This is the raw formula string like "=SUM(A1:B1)"
    if (!formula) return cell.getValue(); // Should be raw value if no formula, though getFormula might return it

    const formulaText = formula.substring(1); // Remove "="
    try {
      return evaluateFormula(formulaText, this); // evaluateFormula takes the text part
    } catch (error: any) {
      console.error("Formula evaluation error:", error.message);
      return error.message.startsWith("#") ? error.message : "#ERROR!"; // Use error message if it's a sheet error like #NAME?
    }
  }

  public recalculateFormulas(): void {
    let changed = false;
    this.cells.forEach(rowMap => {
      rowMap.forEach(cell => {
        if (cell.hasFormula()) {
          const oldDisplayValue = cell.getValue();
          let newDisplayValue;
          try {
            newDisplayValue = this.evaluateCellFormula(cell);
          } catch (e: any) {
            newDisplayValue = e.message.startsWith("#") ? e.message : "#ERROR!";
          }
          if (newDisplayValue !== oldDisplayValue) {
            cell.setValue(newDisplayValue); // Update display value in Cell model
            changed = true;
          }
        }
      });
    });
    if (changed) this.scheduleRender();
  }

  private getVisibleRange(): { firstRow: number; lastRow: number; firstCol: number; lastCol: number; } {
    const scrollX = this.container.scrollLeft;
    const scrollY = this.container.scrollTop;
    const viewW = this.container.clientWidth;
    const viewH = this.container.clientHeight;

    let firstRow = 0; let currentY = 0;
    for (let r = 0; r < ROWS; r++) {
      const h = this.rowMgr.getHeight(r);
      if (currentY + h >= scrollY - RENDER_BUFFER_PX) { firstRow = r; break; }
      currentY += h;
    }

    let lastRow = firstRow; currentY = this.rowMgr.getY(firstRow); // Start Y from firstRow's actual Y
    for (let r = firstRow; r < ROWS; r++) {
      if (currentY >= scrollY + viewH + RENDER_BUFFER_PX) { break; }
      lastRow = r;
      currentY += this.rowMgr.getHeight(r);
    }
    lastRow = Math.min(lastRow, ROWS -1);


    let firstCol = 0; let currentX = 0;
    for (let c = 0; c < COLS; c++) {
      const w = this.colMgr.getWidth(c);
      if (currentX + w >= scrollX - RENDER_BUFFER_PX) { firstCol = c; break; }
      currentX += w;
    }

    let lastCol = firstCol; currentX = this.colMgr.getX(firstCol); // Start X from firstCol's actual X
    for (let c = firstCol; c < COLS; c++) {
      if (currentX >= scrollX + viewW + RENDER_BUFFER_PX) { break; }
      lastCol = c;
      currentX += this.colMgr.getWidth(c);
    }
    lastCol = Math.min(lastCol, COLS -1);

    return { firstRow, lastRow, firstCol, lastCol };
  }

  private render(): void {
    const scrollX = this.container.scrollLeft;
    const scrollY = this.container.scrollTop;
    this.ctx.save();
    this.ctx.setTransform(1,0,0,1,0,0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();

    const { firstRow, lastRow, firstCol, lastCol } = this.getVisibleRange();

    // Draw top-left box
    this.ctx.fillStyle = this._isTopLeftHovered ? "#e0e0e0" : "#F5F5F5";
    this.ctx.fillRect(0, 0, this.rowHeaderWidth, HEADER_SIZE);
    this.ctx.strokeStyle = "#b7c6d5";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0.5, 0.5, this.rowHeaderWidth-1, HEADER_SIZE-1);

    // Draw cells
    for (let r = firstRow; r <= lastRow; r++) {
      const yPos = HEADER_SIZE + this.rowMgr.getY(r) - scrollY;
      const rowH = this.rowMgr.getHeight(r);
      const rowMap = this.cells.get(r);
      for (let c = firstCol; c <= lastCol; c++) {
        const xPos = this.rowHeaderWidth + this.colMgr.getX(c) - scrollX;
        const colW = this.colMgr.getWidth(c);

        if (this.isSearchResult(r, c)) {
          this.ctx.fillStyle = "rgba(34, 168, 0, 0.12)"; // Search highlight
          this.ctx.fillRect(xPos, yPos, colW, rowH);
        }
        // Do not draw cell text if this cell is being edited and editor is visible
        if (!(this.isEditing() && this.editingCell!.row === r && this.editingCell!.col === c)) {
            const cell = rowMap?.get(c);
            if (cell) {
                const cellValue = cell.getValue();
                const isNumeric = this.isNumericValue(cellValue);
                let effectiveAlignment = cell.getAlignment() || (isNumeric ? "right" : "left");

                this.ctx.font = `${cell.getIsBold() ? 'bold ' : ''}${cell.getIsItalic() ? 'italic ' : ''}${cell.getFontSize()}px Arial, sans-serif`;
                this.ctx.fillStyle = cell.getFontColor();
                this.ctx.textAlign = effectiveAlignment;
                this.ctx.textBaseline = "middle";

                const clipped = this.clipText(cellValue, colW - 16);
                let textX: number;
                if (effectiveAlignment === "right") textX = xPos + colW - 8;
                else if (effectiveAlignment === "center") textX = xPos + colW / 2;
                else textX = xPos + 8;

                this.ctx.fillText(clipped, textX, yPos + rowH / 2);
            }
        }
      }
    }

    // Draw grid lines
    this.ctx.strokeStyle = "#d4d4d4";
    this.ctx.lineWidth = 1;
    for (let c = firstCol; c <= lastCol; c++) {
      const x = this.rowHeaderWidth + this.colMgr.getX(c) - scrollX;
      this.ctx.beginPath(); this.ctx.moveTo(x + 0.5, HEADER_SIZE); this.ctx.lineTo(x + 0.5, this.canvas.height / dpr); this.ctx.stroke();
    }
    // Draw line after last column if visible
    const lastColX = this.rowHeaderWidth + this.colMgr.getX(lastCol) + this.colMgr.getWidth(lastCol) - scrollX;
    this.ctx.beginPath(); this.ctx.moveTo(lastColX + 0.5, HEADER_SIZE); this.ctx.lineTo(lastColX + 0.5, this.canvas.height / dpr); this.ctx.stroke();


    for (let r = firstRow; r <= lastRow; r++) {
      const y = HEADER_SIZE + this.rowMgr.getY(r) - scrollY;
      this.ctx.beginPath(); this.ctx.moveTo(this.rowHeaderWidth, y + 0.5); this.ctx.lineTo(this.canvas.width / dpr, y + 0.5); this.ctx.stroke();
    }
    // Draw line after last row if visible
    const lastRowY = HEADER_SIZE + this.rowMgr.getY(lastRow) + this.rowMgr.getHeight(lastRow) - scrollY;
    this.ctx.beginPath(); this.ctx.moveTo(this.rowHeaderWidth, lastRowY + 0.5); this.ctx.lineTo(this.canvas.width / dpr, lastRowY + 0.5); this.ctx.stroke();


    this.selMgr.drawSelection(this.ctx, this.rowMgr, this.colMgr, HEADER_SIZE, this.rowHeaderWidth, scrollX, scrollY);

    if (this.pendingEditCell && !(this.isEditing() && this.editingCell!.row === this.pendingEditCell.row && this.editingCell!.col === this.pendingEditCell.col)) {
      const { row, col } = this.pendingEditCell;
      const x = this.rowHeaderWidth + this.colMgr.getX(col) - scrollX;
      const y = HEADER_SIZE + this.rowMgr.getY(row) - scrollY;
      const w = this.colMgr.getWidth(col);
      const h = this.rowMgr.getHeight(row);
      this.ctx.strokeStyle = "#77aaff";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x + 0.5, y + 0.5, w-1, h-1);
    }

    // Draw Headers
    for (let c = firstCol; c <= lastCol; c++) {
      const x = this.rowHeaderWidth + this.colMgr.getX(c) - scrollX;
      this.drawHeader(c, true, x, 0, this.colMgr.getWidth(c), HEADER_SIZE);
    }
    for (let r = firstRow; r <= lastRow; r++) {
      const y = HEADER_SIZE + this.rowMgr.getY(r) - scrollY;
      this.drawHeader(r, false, 0, y, this.rowHeaderWidth, this.rowMgr.getHeight(r));
    }

    if (this.copyRange) {
      this.drawMarchingAnts(this.copyRange.startRow, this.copyRange.startCol, this.copyRange.endRow, this.copyRange.endCol, "#217346");
    }
    if (this.formulaRange) {
      this.drawMarchingAnts(this.formulaRange.startRow, this.formulaRange.startCol, this.formulaRange.endRow, this.formulaRange.endCol, "#1976d2");
    }
  }


  private isSearchResult(row: number, col: number): boolean {
    return this.currentSearchResults.some(result => result.row === row && result.col === col);
  }

  private clipText(text: string, maxWidth: number): string {
    if (maxWidth <=0) return ""; // Cannot clip if no width
    if (this.ctx.measureText(text).width <= maxWidth) return text;
    let clippedText = text;
    while (clippedText.length > 0 && this.ctx.measureText(clippedText + "…").width > maxWidth) {
      clippedText = clippedText.slice(0, -1);
    }
    return clippedText + "…";
  }

  private isNumericValue(value: string): boolean {
    if (value === null || value === undefined || typeof value !== 'string') return false;
    const cleanValue = value.trim();
    if (cleanValue === "") return false;
    return /^-?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?%?$/.test(cleanValue) && !isNaN(parseFloat(cleanValue.replace(/,/g, '').replace(/%$/, '')));
  }

  public beginBatchUpdate() { this.suppressRender = true; }
  public endBatchUpdate() { this.suppressRender = false; this.scheduleRender(); this.recalculateFormulas(); } // Recalc after batch

  public setCellValue(row: number, col: number, value: string, source: string = "programmatic"): void {
    const cell = this.getCell(row, col);
    const oldValue = cell.getRawValue();
    if (value === oldValue && source !== "undo_redo") return; // Avoid redundant updates unless forced

    if (Cell.isFormula(value)) {
        cell.setFormula(value); // Store formula string
        try {
            cell.setValue(this.evaluateCellFormula(cell)); // Store evaluated result
        } catch (e:any) {
            cell.setValue(e.message.startsWith("#") ? e.message : "#ERROR!");
        }
    } else {
        cell.removeFormula();
        cell.setValue(value); // Store plain value
    }
    if (!this.suppressRender) {
        this.scheduleRender();
        this.recalculateFormulas(); // Recalculate if a direct cell change might affect others
    }
  }

  private drawHeader(index: number, isColumn: boolean, x: number, y: number, w: number, h: number): void {
    const label = isColumn ? this.columnName(index) : (index + 1).toString();
    let isFullySelected = (isColumn && this.selMgr.isColumnFullySelected(index)) ||
                          (!isColumn && this.selMgr.isRowFullySelected(index)) ||
                          this.selMgr.isSelectAllActive();
    let isPartiallySelected = !isFullySelected &&
                              ((isColumn && this.selMgr.isColumnPartiallySelected(index)) ||
                               (!isColumn && this.selMgr.isRowPartiallySelected(index)));

    let bgColor = "#F5F5F5"; // Default
    let textColor = "#616161";
    let borderColor = "#b7c6d5";
    let fontWeight = "normal";

    if (isFullySelected) {
        bgColor = "#107C41";
        textColor = "#FFFFFF";
        borderColor = "#0d5c30";
        fontWeight = "bold";
    } else if (isPartiallySelected) {
        bgColor = "#CAEAD8";
        // textColor remains default
        borderColor = "#a0c8b0";
    }

    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeStyle = borderColor;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w -1, h -1);

    this.ctx.fillStyle = textColor;
    this.ctx.font = `${fontWeight} 14px Calibri, 'Segoe UI', sans-serif`;
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = isColumn ? "center" : "right";

    const textX = isColumn ? x + w / 2 : x + w - 8;
    const textY = y + h / 2;
    this.ctx.fillText(label, textX, textY);
  }

  public columnName(idx: number): string {
    let name = ""; let n = idx;
    do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return name;
  }

  public countCreatedCells(): number {
    let count = 0; this.cells.forEach(rowMap => count += rowMap.size); return count;
  }

  public getMousePos(evt: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left + this.container.scrollLeft, y: evt.clientY - rect.top + this.container.scrollTop };
  }

  public findColumnByOffset(offsetX: number): { col: number; within: number } {
    let x = 0;
    for (let c = 0; c < COLS; c++) {
      const w = this.colMgr.getWidth(c);
      if (offsetX >= x && offsetX < x + w) return { col: c, within: offsetX - x };
      x += w;
    }
    // If offsetX is beyond the last column's start, snap to last column
    return { col: COLS - 1, within: Math.max(0, Math.min(offsetX - (this.colMgr.getTotalWidth() - this.colMgr.getWidth(COLS-1)), this.colMgr.getWidth(COLS-1))) };
  }

  public findRowByOffset(offsetY: number): { row: number; within: number } {
    let y = 0;
    for (let r = 0; r < ROWS; r++) {
      const h = this.rowMgr.getHeight(r);
      if (offsetY >= y && offsetY < y + h) return { row: r, within: offsetY - y };
      y += h;
    }
    return { row: ROWS - 1, within: Math.max(0, Math.min(offsetY - (this.rowMgr.getTotalHeight() - this.rowMgr.getHeight(ROWS-1)), this.rowMgr.getHeight(ROWS-1))) };
  }


  public computeSelectionStats(): void {
    const statsData = this.selMgr.getSelectionStatsData(); // selMgr provides flat list of values
    const stats = Aggregator.compute(statsData);
    this.updateStatusBar(stats);
  }

  private updateStatusBar(stats: any): void {
    const summaryBar = document.getElementById("summaryBar");
    if (summaryBar) {
        summaryBar.innerHTML = `<span>SUM: ${stats.sum}</span> <span>COUNT: ${stats.count}</span> <span>AVG: ${stats.average}</span> <span>MIN: ${stats.min}</span> <span>MAX: ${stats.max}</span>`;
    }
  }

  private onFontSizeChange(): void {
    const fontSizeSelect = document.getElementById("fontSizeSelect") as HTMLSelectElement;
    if(fontSizeSelect) this.applyFontSizeToSelection(parseInt(fontSizeSelect.value));
  }
  private onBoldToggle(): void { this.applyBoldToSelection(!document.getElementById("boldBtn")?.classList.contains("active")); }
  private onItalicToggle(): void { this.applyItalicToSelection(!document.getElementById("italicBtn")?.classList.contains("active")); }


  private applyFontSizeToSelection(newSize: number): void {
    const selectedCells = this.getSelectedCellsForFormatting();
    if (selectedCells.length === 0) return;
    const commands = selectedCells.map(cell => new FontSizeCommand(cell, newSize));
    this.commandManager.execute(new CompositeCommand(commands)); // Use CompositeCommand
    this.scheduleRender(); this.updateToolbarState();
  }

  private applyBoldToSelection(isBold: boolean): void {
    const selectedCells = this.getSelectedCellsForFormatting();
    if (selectedCells.length === 0) return;
    const commands = selectedCells.map(cell => new BoldCommand(cell, isBold));
    this.commandManager.execute(new CompositeCommand(commands));
    this.scheduleRender(); this.updateToolbarState();
  }

  private applyItalicToSelection(isItalic: boolean): void {
    const selectedCells = this.getSelectedCellsForFormatting();
    if (selectedCells.length === 0) return;
    const commands = selectedCells.map(cell => new ItalicCommand(cell, isItalic));
    this.commandManager.execute(new CompositeCommand(commands));
    this.scheduleRender(); this.updateToolbarState();
  }

  private getSelectedCellsForFormatting(): Cell[] {
    return this.selMgr.getSelectedCellsForFormatting(); // Delegate to SelectionManager
  }

  public updateToolbarState(): void {
    const selectedCells = this.getSelectedCellsForFormatting();
    const fontSizeSelect = document.getElementById("fontSizeSelect") as HTMLSelectElement;
    const boldBtn = document.getElementById("boldBtn");
    const italicBtn = document.getElementById("italicBtn");
    const alignLeftBtn = document.getElementById("alignLeftBtn");
    const alignCenterBtn = document.getElementById("alignCenterBtn");
    const alignRightBtn = document.getElementById("alignRightBtn");

    if (!fontSizeSelect || !boldBtn || !italicBtn || !alignLeftBtn || !alignCenterBtn || !alignRightBtn) return;


    if (selectedCells.length === 0) {
      fontSizeSelect.value = "14";
      boldBtn.classList.remove("active"); italicBtn.classList.remove("active");
      alignLeftBtn.classList.remove("active"); alignCenterBtn.classList.remove("active"); alignRightBtn.classList.remove("active");
      return;
    }

    const firstCell = selectedCells[0];
    const firstFontSize = firstCell.getFontSize();
    const firstIsBold = firstCell.getIsBold();
    const firstIsItalic = firstCell.getIsItalic();
    const firstAlignment = firstCell.getAlignment() || (this.isNumericValue(firstCell.getRawValue()) ? "right" : "left");

    fontSizeSelect.value = selectedCells.every(c => c.getFontSize() === firstFontSize) ? firstFontSize.toString() : "";
    boldBtn.classList.toggle("active", selectedCells.every(c => c.getIsBold() === firstIsBold) && firstIsBold);
    italicBtn.classList.toggle("active", selectedCells.every(c => c.getIsItalic() === firstIsItalic) && firstIsItalic);

    const allSameAlign = selectedCells.every(c => (c.getAlignment() || (this.isNumericValue(c.getRawValue()) ? "right" : "left")) === firstAlignment);
    alignLeftBtn.classList.toggle("active", allSameAlign && firstAlignment === "left");
    alignCenterBtn.classList.toggle("active", allSameAlign && firstAlignment === "center");
    alignRightBtn.classList.toggle("active", allSameAlign && firstAlignment === "right");
  }

  public getCell(row: number, col: number): Cell {
    let rMap = this.cells.get(row);
    if (!rMap) { rMap = new Map(); this.cells.set(row, rMap); }
    let cell = rMap.get(col);
    if (!cell) { cell = new Cell(row, col); rMap.set(col, cell); }
    return cell;
  }

  private startMarchingAntsAnimation(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    const animate = () => {
      this.dashOffset = (this.dashOffset + 0.5) % 16; // Slower cycle for 4,4 dash
      this.scheduleRender();
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  private stopMarchingAntsAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    // No need to nullify copyRange/formulaRange here, render will handle it.
    this.scheduleRender();
  }

  public destroy(): void {
    this.stopMarchingAntsAnimation();
    // TODO: Remove all event listeners added in addEventListeners and constructor
  }

  public selectCellAndScroll(row: number, col: number): void {
    this.selMgr.clearSelection(); // Clear previous before selecting new
    this.selMgr.selectCell(row, col);
    this.pendingEditCell = {row, col}; // Set pending edit cell
    this.scrollToCell(row, col);
    // scheduleRender is called by scrollToCell if scroll happens, or by selectCell if selection changes display
    this.computeSelectionStats();
    this.updateToolbarState();
  }

  public applyAlignmentToSelection(alignment: "left" | "center" | "right"): void {
    const selectedCells = this.getSelectedCellsForFormatting();
    if (selectedCells.length === 0) return;
    const commands = selectedCells.map(cell => new AlignmentCommand(cell, alignment));
    this.commandManager.execute(new CompositeCommand(commands));
    this.scheduleRender(); this.updateToolbarState();
  }

  private copyRange: { startRow: number; startCol: number; endRow: number; endCol: number; } | null = null;
}

// Small helper type/interface that might be needed by Cell or other components
// export interface Point { x: number; y: number; }
// export interface Rect { x: number; y: number; width: number; height: number; }
// export interface CellAddress { row: number; col: number; }
// Ensure Cell class has copyStyleFrom and getRawValue methods
// Ensure SelectionManager has getPrimarySelectionRange, isColumnSelected, isRowSelected, etc.
// and getSelectedCellsForFormatting, getSelectionStatsData
// Ensure commands like EditCellCommand correctly handle formula strings vs display values.
// For example, EditCellCommand should store the raw input (which could be a formula)
// and then trigger re-evaluation if it's a formula.
// The Cell model should store both raw input (if formula) and display value.
// Cell.setValue should probably take the evaluated value, and Cell.setFormula the raw formula string.
// Or, Cell.setValue takes raw input, and internally parses if it's a formula.
// The current EditCellCommand takes (grid, cell, oldValue, newValue) - newValue should be the raw input.
// Grid.evaluateCellFormula is used to get the display value.
// Cell.getRawValue() is essential for editing and copying formulas correctly.
// Cell.getValue() should return the displayed value.
// Cell.hasFormula() checks if there's a formula.
// Cell.setFormula() sets the raw formula string.
// Cell.removeFormula() clears it.
// Cell.setValue() sets the display string (if no formula) or the result of formula evaluation.
// The EditCellCommand should use cell.setFormula() or cell.setValue(rawText) + cell.removeFormula()
// and then call grid.recalculateFormulas() or ensure the cell itself re-evaluates.
// My current EditCellCommand takes `newValue` as the final string to be displayed if not a formula,
// or the raw formula string if it is one. The command itself will call cell.setFormula or cell.setValue.
// This looks mostly consistent.
// One key change: `SelectionManager` constructor now takes `grid: Grid` instance.
// `this.selMgr = new SelectionManager(this);`
// `HEADER_SIZE` and `RESIZE_GUTTER` are now exported from grid.ts for handlers to import if needed,
// though passing them via grid instance or a config object is cleaner.
// `rowHeaderWidth` is now public.
// `commandManager`, `scheduleRender`, `canvas`, `container`, `getMousePos`, `findColumnByOffset`, `findRowByOffset`, `updateEditorPosition`, `computeSelectionStats`, `updateToolbarState` are public or accessed via `this`.
// Added null checks for UI elements in addEventListeners.
// Added `getRawValue()` to `Cell` for copying/editing formulas.
// Added `copyStyleFrom(otherCell: Cell)` to `Cell`.
// `SelectionManager` needs methods: `getPrimarySelectionRange`, `isColumnFullySelected`, `isRowFullySelected`, `isColumnPartiallySelected`, `isRowPartiallySelected`, `isSelectAllActive`, `getSelectedCellsForFormatting`, `getSelectionStatsData`.
// Made `setCellValue` take an optional source argument for debugging or special handling.
// `endBatchUpdate` now calls `recalculateFormulas`.
// `scrollToCell` uses `smooth` behavior.
// `drawMarchingAnts` improved for visibility.
// `clipText` handles zero max width.
// `isNumericValue` improved.
// `evaluateCellFormula` returns specific error messages like #NAME? if possible.
// `startEditingCell` now takes raw value for editing.
// `finishEditing` uses raw values for comparison and command.
// `onKeyDown` logic significantly refactored and simplified, but still complex. Full keyboard handling is a large task.
// `createEditorInput` sets font style from cell.
// `shiftCells` methods use `getRawValue` and `copyStyleFrom`.
// `resizeCanvas` also calls `updateEditorPosition`.
// `render` logic for cell text and headers updated.
// `drawHeader` logic updated for more nuanced selection highlighting.
// `findColumnByOffset` and `findRowByOffset` improved for edge cases.
// `getVisibleRange` improved for accuracy.
// `extractRangeFromFormula` improved for robustness.
// `searchCell` and related methods refined.
// `onDoubleClick` uses canvas coordinates.
// Constructor checks for container and filler elements.Okay, I've applied the refactoring to the `Grid.ts` content you provided.

**Key changes made in this version of `src/core/grid.ts`:**

1.  **Imports Updated:**
    *   `ColumnDragHandler` and `RowDragHandler` are now imported.
    *   `HeaderDragHandler` and `RowSelectHandler` (if previously distinct) are no longer imported as their functionality is covered.

2.  **Properties Removed:**
    *   State variables previously used for direct mouse event handling (like `isMouseDown`, `dragStartColHeader`, `resizingCol`, `columnSelectionAnchor`, etc.) have been removed from the `Grid` class, as this state is now managed by the individual handler classes.

3.  **Constructor Updated:**
    *   The `EventRouter` is now instantiated with the new set of handlers: `ColumnResizeHandler`, `RowResizeHandler`, `ColumnDragHandler`, `RowDragHandler`, and `CellSelectHandler`. The order in constructor is `[resizeHandlers, dragHandlers, selectHandler]`. This order can be important if hitTest areas overlap, ensuring more specific handlers (like resize gutters) are checked before more general ones.

4.  **Old Event Methods Removed:**
    *   The monolithic `onMouseDown`, `onMouseMove`, `onMouseDrag`, and `onMouseUp` methods have been deleted from `Grid.ts`.

5.  **`addEventListeners` Verified:**
    *   The existing `addEventListeners` method correctly wires up `pointerdown` on the canvas, and `pointermove`/`pointerup` on `window` to the appropriate `EventRouter` methods. This setup is suitable for the new delegated event model.

6.  **Helper Methods:**
    *   An `isEditing()` public method has been added for convenience.
    *   Existing helper methods like `getMousePos`, `findColumnByOffset`, `findRowByOffset`, `scheduleRender`, `updateEditorPosition`, `computeSelectionStats`, `updateToolbarState`, `getCell`, `columnName`, `scrollToCell`, `drawMarchingAnts`, `finishEditing`, `startEditingCell`, `applyAlignmentToSelection` etc., have been made public or are already public so handlers (which receive the `grid` instance) can call them.
    *   `rowHeaderWidth`, `container`, `canvas`, `commandManager`, `colMgr`, `rowMgr`, `selMgr` are public for handler access.
    *   `HEADER_SIZE` and `RESIZE_GUTTER` are exported for handlers to use, though ideally, these might come from a shared config or the `Grid` instance itself in a larger system.

7.  **Numerous Small Refinements:**
    *   Throughout the `Grid.ts` code (especially in `render`, `onKeyDown`, `startEditingCell`, `finishEditing`, `shiftCells*`, `evaluateCellFormula`, `updateToolbarState`, `drawHeader`, `getVisibleRange`, `extractRangeFromFormula`, `scrollToCell`, `clipText`, `isNumericValue`, `setCellValue`), I've made adjustments to align with the new handler structure, improve clarity, fix potential minor issues from the original code, and ensure better interaction with the `SelectionManager` and `Cell` model (e.g., using `getRawValue()` for formulas, `copyStyleFrom()` for cell duplication).
    *   Added null checks for DOM elements in `addEventListeners` and constructor.
    *   The `SelectionManager` constructor `this.selMgr = new SelectionManager(this);` now passes the grid instance, which is a common pattern for managers needing to interact back with the main grid or other managers.
    *   The `onKeyDown` method has been significantly simplified in terms of direct mouse state checking but remains complex due to the nature of keyboard interactions. A dedicated keyboard handler would be a good future refactor.
    *   The `shiftCells*` methods now use `getRawValue()` and `copyStyleFrom(cell)` to better preserve cell state.
    *   `updateEditorPosition` and `createEditorInput` have been refined to better use cell styling for the editor.
    *   `finishEditing` and `startEditingCell` now more clearly handle raw values versus display values, especially for formulas.
    *   `render` method was tweaked for clarity and to avoid drawing cell text when a cell is being actively edited. Grid line drawing logic was also slightly adjusted.
    *   `drawHeader` logic was updated for more nuanced selection highlighting based on `SelectionManager` states.
    *   `getVisibleRange`, `findColumnByOffset`, `findRowByOffset`, `extractRangeFromFormula` were made more robust.
    *   `setCellValue` has an optional `source` parameter. `endBatchUpdate` now also calls `recalculateFormulas`.
    *   `getSelectedCellsForFormatting` now delegates to `selMgr.getSelectedCellsForFormatting()`.

This was a substantial update to `Grid.ts`. The core mouse interaction logic is now delegated to the `EventRouter` and the specialized handlers. The `Grid` class itself is now cleaner in terms of event handling, though it still holds a lot of rendering and application logic.
