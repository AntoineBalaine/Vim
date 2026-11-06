import { Cursor } from '../common/motion/cursor';
import { Mode } from '../mode/mode';
import type { VimState } from '../state/vimState';

/**
 * The most selections that the history remembers for one editor.
 */
export const MAX_SELECTION_HISTORY = 100;

/**
 * What `gv` remembers about a selection: the mode, the primary cursor and the other cursors by their index.
 * The history stores the same shape, so that one entry can be put back the way `gv` puts back its selection.
 */
export interface SelectionSnapshot {
  mode: Mode.Visual | Mode.VisualLine | Mode.VisualBlock;
  start: Cursor['start'];
  end: Cursor['stop'];
  multiCursorIndexSecondaryCursorMap?: Map<number, Cursor> | undefined;
}

/**
 * Reads the selections that the editor shows now, with the shape that `gv` stores.
 * Every cursor other than the primary one is kept by its index.
 */
export function snapshotOfSelection(
  vimState: VimState,
  mode: SelectionSnapshot['mode'],
): SelectionSnapshot {
  const cursors = vimState.cursors;
  const primaryCursor = vimState.cursor;
  const multiCursorIndexSecondaryCursorMap = new Map<number, Cursor>();
  if (cursors.length > 1) {
    for (let i = 0; i < cursors.length; i++) {
      const cursor = cursors[i];
      if (cursor === primaryCursor) {
        continue;
      }
      multiCursorIndexSecondaryCursorMap.set(i, new Cursor(cursor.start, cursor.stop));
    }
  }
  return {
    mode,
    start: vimState.cursorStartPosition,
    end: vimState.cursorStopPosition,
    multiCursorIndexSecondaryCursorMap,
  };
}

/**
 * Tells whether two snapshots select the same text with the same cursors.
 */
export function isSameSnapshot(a: SelectionSnapshot, b: SelectionSnapshot): boolean {
  if (a.mode !== b.mode || !a.start.isEqual(b.start) || !a.end.isEqual(b.end)) {
    return false;
  }
  const mapA = a.multiCursorIndexSecondaryCursorMap ?? new Map<number, Cursor>();
  const mapB = b.multiCursorIndexSecondaryCursorMap ?? new Map<number, Cursor>();
  if (mapA.size !== mapB.size) {
    return false;
  }
  for (const [index, cursor] of mapA) {
    const other = mapB.get(index);
    if (other === undefined || !cursor.equals(other)) {
      return false;
    }
  }
  return true;
}

/**
 * Copies a snapshot, so that a later change of the original does not change the entry.
 */
export function copySnapshot(snapshot: SelectionSnapshot): SelectionSnapshot {
  return {
    mode: snapshot.mode,
    start: snapshot.start,
    end: snapshot.end,
    multiCursorIndexSecondaryCursorMap: new Map(snapshot.multiCursorIndexSecondaryCursorMap ?? []),
  };
}

/**
 * The history of the selections of one editor, which works like the jump list of Kakoune.
 *
 * Because `gv` remembers only the last selection, this list keeps the earlier ones and moves through them
 * the way the jump list moves through positions: a new entry made from the middle of the list drops the
 * entries after it, an entry that already exists moves to the end, and going back first keeps the selection
 * that is shown, so that going forward can return to it.
 */
export class SelectionHistory {
  public entries: SelectionSnapshot[] = [];

  /**
   * The index of the entry that the editor shows, or `entries.length` when it shows none of them.
   */
  public current = 0;

  /**
   * Adds a selection at the end of the history.
   */
  public push(snapshot: SelectionSnapshot): void {
    if (this.current < this.entries.length) {
      this.entries.splice(this.current + 1);
    }
    this.entries = this.entries.filter((entry) => !isSameSnapshot(entry, snapshot));
    this.entries.push(copySnapshot(snapshot));
    if (this.entries.length > MAX_SELECTION_HISTORY) {
      this.entries.splice(0, this.entries.length - MAX_SELECTION_HISTORY);
    }
    this.current = this.entries.length;
  }

  /**
   * Goes back by a number of entries.
   *
   * @param shown The selection that the editor shows now, or undefined when it shows none in Visual mode
   * @param count How many entries to go back
   * @returns The selection to show, or undefined when the history has not that many entries
   */
  public backward(
    shown: SelectionSnapshot | undefined,
    count: number,
  ): SelectionSnapshot | undefined {
    const isOnEntry =
      shown !== undefined &&
      this.current < this.entries.length &&
      isSameSnapshot(this.entries[this.current], shown);
    const mustPush = shown !== undefined && !isOnEntry;
    const previousEntries = this.entries;
    const previousCurrent = this.current;
    if (mustPush) {
      this.push(shown);
    }
    const steps = count + (mustPush ? 1 : 0);
    if (this.current - steps < 0) {
      this.entries = previousEntries;
      this.current = previousCurrent;
      return undefined;
    }
    this.current -= steps;
    return this.entries[this.current];
  }

  /**
   * Goes forward by a number of entries.
   *
   * @returns The selection to show, or undefined when the history has not that many entries
   */
  public forward(count: number): SelectionSnapshot | undefined {
    if (this.current >= this.entries.length || this.current + count >= this.entries.length) {
      return undefined;
    }
    this.current += count;
    return this.entries[this.current];
  }

  public clear(): void {
    this.entries = [];
    this.current = 0;
  }
}
