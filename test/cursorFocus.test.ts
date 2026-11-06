import assert from 'assert/strict';
import { Position } from 'vscode';
import { Cursor } from '../src/common/motion/cursor';
import {
  DormantTextChange,
  cycleFocus,
  inDocumentOrder,
  mapCursorsThroughChanges,
  mapPositionThroughChange,
  restoreAll,
} from '../src/state/dormantCursors';
import { newTest } from './testSimplifier';

function at(line: number, character: number): Cursor {
  return Cursor.atPosition(new Position(line, character));
}

function lines(cursors: readonly Cursor[]): number[] {
  return cursors.map((cursor) => cursor.stop.line);
}

function insertion(line: number, character: number, text: string): DormantTextChange {
  const position = new Position(line, character);
  return { start: position, end: position, text };
}

suite('Cursor focus', () => {
  suite('Ring of cursors', () => {
    test('Moves the focus to the next cursor and leaves the others dormant', () => {
      const focus = cycleFocus([at(0, 0), at(1, 0), at(2, 0)], [], 1);
      assert.deepEqual(lines(focus.active), [1]);
      assert.deepEqual(lines(focus.dormant), [0, 2]);
    });

    test('Wraps around at both ends of the document', () => {
      const forward = cycleFocus([at(2, 0)], [at(0, 0), at(1, 0)], 1);
      assert.deepEqual(lines(forward.active), [0]);
      const backward = cycleFocus([at(0, 0)], [at(1, 0), at(2, 0)], -1);
      assert.deepEqual(lines(backward.active), [2]);
    });

    test('Moves several cursors with a count', () => {
      const focus = cycleFocus([at(0, 0)], [at(1, 0), at(2, 0), at(3, 0)], 2);
      assert.deepEqual(lines(focus.active), [2]);
      assert.equal(focus.dormant.length, 3);
    });

    test('Follows the order of the document, whatever the order that the cursors were added in', () => {
      const focus = cycleFocus([at(2, 0)], [at(0, 0), at(1, 0)], 1);
      assert.deepEqual(lines(focus.active), [0]);
    });

    test('Takes the active cursors that were added during the focus into the ring', () => {
      const focus = cycleFocus([at(1, 0), at(4, 0)], [at(0, 0)], 1);
      assert.deepEqual(lines(focus.active), [4]);
      assert.deepEqual(lines(focus.dormant), [0, 1]);
    });

    test('Does nothing with a single cursor', () => {
      const focus = cycleFocus([at(1, 0)], [], 1);
      assert.deepEqual(lines(focus.active), [1]);
      assert.equal(focus.dormant.length, 0);
    });

    test('Restores every cursor, with the focused cursor as the main one', () => {
      const restored = restoreAll([at(1, 0)], [at(0, 0), at(2, 0)]);
      assert.deepEqual(lines(restored), [1, 0, 2]);
    });

    test('Keeps one cursor of two equal ones', () => {
      assert.equal(inDocumentOrder([at(0, 1), at(0, 1), at(0, 2)]).length, 2);
    });
  });

  suite('Dormant cursors through edits', () => {
    test('Keeps a position before the change and shifts one after it on the same line', () => {
      assert.deepEqual(
        mapPositionThroughChange(new Position(0, 2), insertion(0, 5, 'xx')),
        new Position(0, 2),
      );
      assert.deepEqual(
        mapPositionThroughChange(new Position(0, 8), insertion(0, 5, 'xx')),
        new Position(0, 10),
      );
    });

    test('Shifts the lines after an inserted line break', () => {
      assert.deepEqual(
        mapPositionThroughChange(new Position(3, 1), insertion(0, 0, 'a\nb')),
        new Position(4, 1),
      );
      assert.deepEqual(
        mapPositionThroughChange(new Position(0, 8), insertion(0, 5, 'a\nbc')),
        new Position(1, 5),
      );
    });

    test('Moves a position inside a deleted range to its start, and shifts the lines after the deletion up', () => {
      const deletion: DormantTextChange = {
        start: new Position(1, 2),
        end: new Position(3, 4),
        text: '',
      };
      assert.deepEqual(mapPositionThroughChange(new Position(2, 0), deletion), new Position(1, 2));
      assert.deepEqual(mapPositionThroughChange(new Position(3, 9), deletion), new Position(1, 7));
      assert.deepEqual(mapPositionThroughChange(new Position(5, 1), deletion), new Position(3, 1));
    });

    test('Follows the text through several changes of one edit', () => {
      const moved = mapCursorsThroughChanges(
        [at(0, 10)],
        [insertion(0, 0, 'ab'), insertion(0, 5, 'c')],
      );
      assert.deepEqual(moved[0].stop, new Position(0, 13));
    });
  });

  suite('g) g( and g= in the editor', () => {
    newTest({
      title:
        '`g)` moves the focus, so that an edit changes one cursor, and `g=` brings the others back',
      start: ['|one', '|two', '|three'],
      keysPressed: 'g)' + 'A!' + '<Esc>' + 'g=' + 'A?' + '<Esc>',
      end: ['one|?', 'two!|?', 'three|?'],
    });

    newTest({
      title: '`g(` moves the focus backward, wrapping to the last cursor',
      start: ['|one', '|two', '|three'],
      keysPressed: 'g(' + 'A!' + '<Esc>' + 'g=',
      end: ['|one', '|two', 'three|!'],
    });

    newTest({
      title: 'A count moves the focus several cursors',
      start: ['|one', '|two', '|three'],
      keysPressed: '2g)' + 'A!' + '<Esc>' + 'g=',
      end: ['|one', '|two', 'three|!'],
    });

    newTest({
      title: 'The dormant cursors follow the text when the focused cursor adds a line above them',
      start: ['|one', '|two', '|three'],
      keysPressed: '3g)' + 'ox' + '<Esc>' + 'g=' + 'A!' + '<Esc>',
      end: ['one', 'x|!', 'two|!', 'three|!'],
    });

    newTest({
      title: '<Esc> drops the dormant cursors',
      start: ['|one', '|two', '|three'],
      keysPressed: 'g)' + '<Esc>' + 'A!' + '<Esc>',
      end: ['one', 'two|!', 'three'],
    });
  });
});
