import { Position } from 'vscode';
import { Cursor } from '../common/motion/cursor';
import { Mode } from '../mode/mode';
import type { VimState } from './vimState';

/**
 * One change of a document, with the coordinates of the text before the change.
 */
export interface DormantTextChange {
  start: Position;
  end: Position;
  text: string;
}

/**
 * Moves a position through one change. A position before the change stays,
 * one inside the replaced text goes to the start of the change, and one after it shifts.
 */
export function mapPositionThroughChange(position: Position, change: DormantTextChange): Position {
  if (!change.start.isBefore(position)) {
    return position;
  }
  if (position.isBefore(change.end)) {
    return change.start;
  }
  const pieces = change.text.replace(/\r/g, '').split('\n');
  const insertedLines = pieces.length - 1;
  const removedLines = change.end.line - change.start.line;
  const line = position.line + insertedLines - removedLines;
  if (position.line !== change.end.line) {
    return new Position(line, position.character);
  }
  const lead =
    insertedLines === 0
      ? change.start.character + change.text.length
      : pieces[pieces.length - 1].length;
  return new Position(line, lead + (position.character - change.end.character));
}

/**
 * Moves cursors through the changes of one edit.
 * Because the changes of an edit all use the coordinates of the text before the edit,
 * they are applied from the last one to the first one.
 */
export function mapCursorsThroughChanges(
  cursors: readonly Cursor[],
  changes: readonly DormantTextChange[],
): Cursor[] {
  const ordered = [...changes].sort((a, b) => b.start.compareTo(a.start));
  return cursors.map((cursor) => {
    let mapped = cursor;
    for (const change of ordered) {
      mapped = new Cursor(
        mapPositionThroughChange(mapped.start, change),
        mapPositionThroughChange(mapped.stop, change),
      );
    }
    return mapped;
  });
}

/**
 * Lists cursors in the order of the document, without two equal cursors.
 */
export function inDocumentOrder(cursors: readonly Cursor[]): Cursor[] {
  const sorted = [...cursors].sort(
    (a, b) => a.stop.compareTo(b.stop) || a.start.compareTo(b.start),
  );
  return sorted.filter((cursor, index) => index === 0 || !cursor.equals(sorted[index - 1]));
}

export interface CursorFocus {
  active: Cursor[];
  dormant: Cursor[];
}

/**
 * Makes another cursor the main one, moving along the ring of all the cursors in the order of the document.
 *
 * Without dormant cursors, every cursor stays active and only the main one changes, as the keys ( and ) of Kakoune do.
 * With dormant cursors, the editor can only show active cursors, so the cursor that becomes the main one is the only active one,
 * and every other cursor stays dormant until all of them are restored.
 *
 * @param active The active cursors, of which the first one is the main cursor
 * @param dormant The cursors that wait without being active
 * @param steps How many cursors to move, forward when positive and backward when negative
 */
export function cycleMain(
  active: readonly Cursor[],
  dormant: readonly Cursor[],
  steps: number,
): CursorFocus {
  const ring = inDocumentOrder([...active, ...dormant]);
  if (ring.length < 2) {
    return { active: [...active], dormant: [...dormant] };
  }
  const found = ring.findIndex((cursor) => cursor.equals(active[0]));
  const from = found === -1 ? 0 : found;
  const target = (((from + steps) % ring.length) + ring.length) % ring.length;
  const others = ring.filter((_, index) => index !== target);
  if (dormant.length === 0) {
    return { active: [ring[target], ...others], dormant: [] };
  }
  return { active: [ring[target]], dormant: others };
}

/**
 * Puts every cursor except the main one to sleep, so that the main cursor is the only one that edits.
 */
export function makeSecondariesDormant(active: readonly Cursor[]): CursorFocus {
  return { active: active.slice(0, 1), dormant: inDocumentOrder(active.slice(1)) };
}

/**
 * Makes every dormant cursor active again. The main cursor stays the main one.
 */
export function restoreAll(active: readonly Cursor[], dormant: readonly Cursor[]): Cursor[] {
  const main = active[0];
  const others = inDocumentOrder([...active.slice(1), ...dormant]).filter(
    (cursor) => main === undefined || !cursor.equals(main),
  );
  return main === undefined ? others : [main, ...others];
}

/**
 * Tells whether the keys ( and ) cycle the cursors and not the sentences. They do while there are several cursors
 * in a mode that moves the cursors, so that with one cursor they keep moving by sentence as they do in Vim.
 */
export function cyclesCursors(vimState: VimState): boolean {
  const hasSeveralCursors = vimState.cursors.length > 1 || vimState.dormantCursors.length > 0;
  const isOperatorPending = vimState.currentModeIncludingPseudoModes === Mode.OperatorPendingMode;
  return (
    hasSeveralCursors &&
    !isOperatorPending &&
    [Mode.Normal, Mode.Visual, Mode.VisualLine].includes(vimState.currentMode)
  );
}
