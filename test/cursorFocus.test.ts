import assert from 'assert/strict';
import { Position } from 'vscode';
import { Cursor } from '../src/common/motion/cursor';
import {
  DormantTextChange,
  cycleMain,
  inDocumentOrder,
  makeSecondariesDormant,
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

suite('Cursor cycling', () => {
  suite('Ring of cursors', () => {
    test('Makes the next cursor the main one and keeps every cursor active', () => {
      const focus = cycleMain([at(0, 0), at(1, 0), at(2, 0)], [], 1);
      assert.deepEqual(lines(focus.active), [1, 0, 2]);
      assert.equal(focus.dormant.length, 0);
    });

    test('Wraps around at both ends of the document', () => {
      assert.deepEqual(lines(cycleMain([at(2, 0), at(0, 0), at(1, 0)], [], 1).active)[0], 0);
      assert.deepEqual(lines(cycleMain([at(0, 0), at(1, 0), at(2, 0)], [], -1).active)[0], 2);
    });

    test('Moves several cursors with a count', () => {
      assert.equal(
        cycleMain([at(0, 0), at(1, 0), at(2, 0), at(3, 0)], [], 2).active[0].stop.line,
        2,
      );
    });

    test('Follows the order of the document, whatever the order that the cursors were added in', () => {
      assert.equal(cycleMain([at(2, 0), at(0, 0), at(1, 0)], [], 1).active[0].stop.line, 0);
    });

    test('With dormant cursors, the new main cursor is the only active one', () => {
      const focus = cycleMain([at(0, 0)], [at(1, 0), at(2, 0)], 1);
      assert.deepEqual(lines(focus.active), [1]);
      assert.deepEqual(lines(focus.dormant), [0, 2]);
    });

    test('With dormant cursors, takes the active cursors that were added meanwhile into the ring', () => {
      const focus = cycleMain([at(1, 0), at(4, 0)], [at(0, 0)], 1);
      assert.deepEqual(lines(focus.active), [4]);
      assert.deepEqual(lines(focus.dormant), [0, 1]);
    });

    test('Does nothing with a single cursor', () => {
      const focus = cycleMain([at(1, 0)], [], 1);
      assert.deepEqual(lines(focus.active), [1]);
      assert.equal(focus.dormant.length, 0);
    });

    test('Puts every cursor except the main one to sleep', () => {
      const focus = makeSecondariesDormant([at(1, 0), at(0, 0), at(2, 0)]);
      assert.deepEqual(lines(focus.active), [1]);
      assert.deepEqual(lines(focus.dormant), [0, 2]);
    });

    test('Restores every cursor, with the main cursor first', () => {
      assert.deepEqual(lines(restoreAll([at(1, 0)], [at(0, 0), at(2, 0)])), [1, 0, 2]);
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

  suite('( ) gv and <Esc> in the editor', () => {
    newTest({
      title: '`)` makes the next cursor the main one, and every cursor keeps editing',
      start: ['|one', '|two', '|three'],
      keysPressed: ')' + 'A!' + '<Esc>',
      end: ['one|!', 'two|!', 'three|!'],
    });

    newTest({
      title: '`gv` in Visual mode puts the secondary selections to sleep, and <Esc> wakes them up',
      start: ['|one', '|two', '|three'],
      keysPressed: 'vl' + 'gv' + 'd' + '<Esc>',
      end: ['|e', '|two', '|three'],
    });

    newTest({
      title: 'While the others sleep, `)` gives the editing to the next cursor alone',
      start: ['|one', '|two', '|three'],
      keysPressed: 'v' + 'gv' + ')' + 'd' + '<Esc>',
      end: ['|one', '|wo', '|three'],
    });

    newTest({
      title: 'The sleeping cursors follow the text when the main cursor adds a line above them',
      start: ['|one', '|two', '|three'],
      keysPressed: 'v' + 'gv' + 'c' + 'x\ny' + '<Esc>' + '<Esc>',
      end: ['x', '|yne', '|two', '|three'],
    });

    newTest({
      title: 'With one cursor, `)` is still the next sentence',
      start: ['|One. Two. Three.'],
      keysPressed: ')',
      end: ['One. |Two. Three.'],
    });
  });
});
