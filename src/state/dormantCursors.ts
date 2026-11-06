import { Position } from 'vscode';
import { Cursor } from '../common/motion/cursor';

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
 * Moves the focus along the ring of all the cursors, in the order of the document.
 * Because the editor can only show active cursors, the cursor that has the focus is the only active one,
 * and every other cursor becomes dormant until the focus reaches it or until all of them are restored.
 *
 * @param active The active cursors, of which the first one is the main cursor
 * @param dormant The cursors that wait without being active
 * @param steps How many cursors to move the focus, forward when positive and backward when negative
 */
export function cycleFocus(
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
  return {
    active: [ring[target]],
    dormant: ring.filter((_, index) => index !== target),
  };
}

/**
 * Makes every dormant cursor active again. The cursor that has the focus stays the main one.
 */
export function restoreAll(active: readonly Cursor[], dormant: readonly Cursor[]): Cursor[] {
  const main = active[0];
  const others = inDocumentOrder([...active.slice(1), ...dormant]).filter(
    (cursor) => main === undefined || !cursor.equals(main),
  );
  return main === undefined ? others : [main, ...others];
}
