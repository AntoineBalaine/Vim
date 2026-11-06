import assert from 'assert/strict';
import { Position } from 'vscode';
import { Cursor } from '../src/common/motion/cursor';
import {
  MAX_SELECTION_HISTORY,
  SelectionHistory,
  SelectionSnapshot,
} from '../src/history/selectionHistory';
import { Mode } from '../src/mode/mode';
import { newTest } from './testSimplifier';

function selectionAt(line: number, character: number): SelectionSnapshot {
  return {
    mode: Mode.Visual,
    start: new Position(line, character),
    end: new Position(line, character + 1),
  };
}

function startOf(snapshot: SelectionSnapshot | undefined): string | undefined {
  return snapshot === undefined ? undefined : `${snapshot.start.line}:${snapshot.start.character}`;
}

suite('Selection history', () => {
  suite('SelectionHistory unit tests', () => {
    test('Goes back through the entries, and forward to the selection that was shown', () => {
      const history = new SelectionHistory();
      history.push(selectionAt(0, 0));
      history.push(selectionAt(0, 1));
      assert.equal(startOf(history.backward(selectionAt(0, 2), 1)), '0:1');
      assert.equal(startOf(history.backward(selectionAt(0, 1), 1)), '0:0');
      assert.equal(startOf(history.forward(1)), '0:1');
      assert.equal(startOf(history.forward(1)), '0:2');
      assert.equal(history.forward(1), undefined);
    });

    test('Goes back several entries with a count, and refuses to go beyond the first entry', () => {
      const history = new SelectionHistory();
      for (let character = 0; character < 4; character++) {
        history.push(selectionAt(0, character));
      }
      assert.equal(startOf(history.backward(selectionAt(0, 9), 3)), '0:1');
      const empty = new SelectionHistory();
      assert.equal(empty.backward(selectionAt(0, 0), 1), undefined);
      assert.equal(empty.entries.length, 0);
    });

    test('Goes back from Normal mode, where no selection is shown, without pushing one', () => {
      const history = new SelectionHistory();
      history.push(selectionAt(0, 0));
      history.push(selectionAt(0, 1));
      assert.equal(startOf(history.backward(undefined, 1)), '0:1');
      assert.equal(history.entries.length, 2);
    });

    test('Drops the entries after the current one when a new selection is pushed from the middle', () => {
      const history = new SelectionHistory();
      for (let character = 0; character < 3; character++) {
        history.push(selectionAt(0, character));
      }
      history.backward(selectionAt(0, 5), 2);
      history.push(selectionAt(1, 0));
      assert.equal(history.forward(1), undefined);
    });

    test('Keeps one copy of a selection that is pushed twice, at the end', () => {
      const history = new SelectionHistory();
      history.push(selectionAt(0, 0));
      history.push(selectionAt(0, 1));
      history.push(selectionAt(0, 0));
      assert.deepEqual(
        history.entries.map((entry) => entry.start.character),
        [1, 0],
      );
    });

    test('Tells two selections apart by their other cursors', () => {
      const history = new SelectionHistory();
      const withSecondCursor = {
        ...selectionAt(0, 0),
        multiCursorIndexSecondaryCursorMap: new Map([
          [1, new Cursor(new Position(2, 0), new Position(2, 3))],
        ]),
      };
      history.push(selectionAt(0, 0));
      history.push(withSecondCursor);
      assert.equal(history.entries.length, 2);
    });

    test('Never keeps more entries than the cap', () => {
      const history = new SelectionHistory();
      for (let character = 0; character < MAX_SELECTION_HISTORY + 50; character++) {
        history.push(selectionAt(0, character));
      }
      assert.equal(history.entries.length, MAX_SELECTION_HISTORY);
    });
  });

  suite('g< and g> in the editor', () => {
    newTest({
      title: '`g<` goes back to the previous visual selection, from Normal mode',
      start: ['|one two three'],
      keysPressed: 've' + '<Esc>' + 'w' + 've' + '<Esc>' + 'g<' + 'g<' + 'd',
      end: ['| two three'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '`g>` goes forward again after going back',
      start: ['|one two three'],
      keysPressed: 've' + '<Esc>' + 'w' + 've' + '<Esc>' + 'g<' + 'g<' + 'g>' + 'd',
      end: ['one | three'],
      endMode: Mode.Normal,
    });

    newTest({
      title: 'A count goes back several selections',
      start: ['|one two three'],
      keysPressed: 've' + '<Esc>' + 'w' + 've' + '<Esc>' + 'w' + 've' + '<Esc>' + '3g<' + 'd',
      end: ['| two three'],
      endMode: Mode.Normal,
    });

    newTest({
      title: '`g<` with no earlier selection does nothing',
      start: ['|one two three'],
      keysPressed: 'g<',
      end: ['|one two three'],
      endMode: Mode.Normal,
    });
  });
});
