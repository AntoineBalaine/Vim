import { Position } from 'vscode';
import { Cursor } from '../../common/motion/cursor';
import { SelectionSnapshot } from '../../history/selectionHistory';
import { Mode, isVisualMode } from '../../mode/mode';
import { VimState } from '../../state/vimState';
import { BaseCommand, RegisterAction } from '../base';

@RegisterAction
class EnterVisualMode extends BaseCommand {
  modes = [Mode.Normal, Mode.VisualLine, Mode.VisualBlock];
  keys = ['v'];
  override isCompleteAction = false;

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.Normal && vimState.recordedState.count > 1) {
      vimState.cursorStopPosition = position.getRight(vimState.recordedState.count - 1);
    }
    await vimState.setCurrentMode(Mode.Visual);
  }
}

@RegisterAction
class ExitVisualMode extends BaseCommand {
  modes = [Mode.Visual];
  keys = ['v'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class EnterVisualLineMode extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock];
  keys = ['V'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.Normal && vimState.recordedState.count > 1) {
      vimState.cursorStopPosition = position.getDown(vimState.recordedState.count - 1);
    }
    await vimState.setCurrentMode(Mode.VisualLine);
  }
}

@RegisterAction
class ExitVisualLineMode extends BaseCommand {
  modes = [Mode.VisualLine];
  keys = ['V'];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class EnterVisualBlockMode extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = [['<C-v>'], ['<C-q>']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.currentMode === Mode.Normal && vimState.recordedState.count > 1) {
      vimState.cursorStopPosition = position.getRight(vimState.recordedState.count - 1);
    }
    await vimState.setCurrentMode(Mode.VisualBlock);
  }
}

@RegisterAction
class ExitVisualBlockMode extends BaseCommand {
  modes = [Mode.VisualBlock];
  keys = [['<C-v>'], ['<C-q>']];

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await vimState.setCurrentMode(Mode.Normal);
  }
}

@RegisterAction
class RestoreVisualSelection extends BaseCommand {
  modes = [Mode.Normal];
  keys = ['g', 'v'];

  // Because we put back one selection for every cursor of the last Visual mode, and not only for the cursors that exist
  // now, the command runs once and sets all the cursors itself.
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const lastVisualSelection = vimState.lastVisualSelection;
    if (lastVisualSelection === undefined) {
      return;
    }

    let { start, end, mode } = lastVisualSelection;
    const secondaryCursors = lastVisualSelection.multiCursorIndexSecondaryCursorMap;
    if (
      vimState.cursors.length === 1 &&
      secondaryCursors !== undefined &&
      secondaryCursors.size > 0
    ) {
      await this.restoreAllSelections(vimState, lastVisualSelection);
      return;
    }
    const isCurrentlyHandlingSecondaryCursor = this.multicursorIndex && this.multicursorIndex > 0;
    if (isCurrentlyHandlingSecondaryCursor) {
      const secondarySelection = this.getSecondarySelectionByMultiCursorIndex(
        this.multicursorIndex,
        lastVisualSelection.multiCursorIndexSecondaryCursorMap,
      );
      if (secondarySelection) {
        start = secondarySelection.start;
        end = secondarySelection.stop;
      }
    }
    if (mode !== Mode.Visual || !start.isEqual(end)) {
      if (end.line <= vimState.document.lineCount - 1) {
        if (mode === Mode.Visual && start.isBefore(end)) {
          end = end.getLeftThroughLineBreaks(true);
        }

        await vimState.setCurrentMode(mode);
        vimState.cursorStartPosition = start;
        vimState.cursorStopPosition = end;
      }
    }
  }

  /**
   * Because <Esc> in Normal mode collapses the cursors to one, `gv` has only one cursor left to run for,
   * so we put back here one selection for every cursor that the last Visual mode had.
   * Because the text can have changed since, every position is brought back inside the document.
   */
  async restoreAllSelections(
    vimState: VimState,
    lastVisualSelection: NonNullable<VimState['lastVisualSelection']>,
  ): Promise<void> {
    const { mode } = lastVisualSelection;
    const selections: Cursor[] = [new Cursor(lastVisualSelection.start, lastVisualSelection.end)];
    const secondaryCursors = lastVisualSelection.multiCursorIndexSecondaryCursorMap!;
    for (const index of [...secondaryCursors.keys()].sort((a, b) => a - b)) {
      selections.push(secondaryCursors.get(index)!);
    }

    const restored = selections.map((selection) => {
      const start = vimState.document.validatePosition(selection.start);
      let end = vimState.document.validatePosition(selection.stop);
      if (mode === Mode.Visual && start.isBefore(end)) {
        end = end.getLeftThroughLineBreaks(true);
      }
      return new Cursor(start, end);
    });

    await vimState.setCurrentMode(mode);
    vimState.cursors = restored;
  }

  getSecondarySelectionByMultiCursorIndex(
    multiCursorIndex: number | undefined,
    multiCursorIndexSecondaryCursorMap: Map<number, Cursor> | undefined,
  ): Cursor | undefined {
    if (!multiCursorIndex) {
      return undefined;
    }
    if (!multiCursorIndexSecondaryCursorMap) {
      return undefined;
    }
    return multiCursorIndexSecondaryCursorMap.get(multiCursorIndex);
  }
}

/**
 * Puts back a selection of the history, with every cursor that it had.
 * Because the text can have changed since the selection was made, every position is brought back inside the document.
 */
async function showSnapshot(vimState: VimState, snapshot: SelectionSnapshot): Promise<void> {
  const selections: Cursor[] = [new Cursor(snapshot.start, snapshot.end)];
  const secondaryCursors = snapshot.multiCursorIndexSecondaryCursorMap ?? new Map<number, Cursor>();
  for (const index of [...secondaryCursors.keys()].sort((a, b) => a - b)) {
    selections.push(secondaryCursors.get(index)!);
  }

  const restored = selections.map((selection) => {
    const start = vimState.document.validatePosition(selection.start);
    let end = vimState.document.validatePosition(selection.stop);
    if (snapshot.mode === Mode.Visual && start.isBefore(end)) {
      end = end.getLeftThroughLineBreaks(true);
    }
    return new Cursor(start, end);
  });

  await vimState.setCurrentMode(snapshot.mode);
  vimState.cursors = restored;
}

/**
 * Goes back to the selection before the one that is shown, with `g<`. A count goes back that many selections.
 * Because `gv` keeps only one selection, the history keeps the earlier ones, as the jump list of Kakoune does.
 */
@RegisterAction
class SelectionHistoryBack extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['g', '<'];

  // Because the whole set of cursors is put back at once, the command runs once and not once for every cursor.
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const count = Math.max(vimState.recordedState.count, 1);
    // Because Visual mode keeps `lastVisualSelection` up to date after every action, it is the selection that is shown, in the same form as the entries.
    const shown = isVisualMode(vimState.currentMode) ? vimState.lastVisualSelection : undefined;
    const target = vimState.selectionHistory.backward(shown, count);
    if (target !== undefined) {
      await showSnapshot(vimState, target);
    }
  }
}

/**
 * Goes forward to the selection after the one that is shown, with `g>`. A count goes forward that many selections.
 */
@RegisterAction
class SelectionHistoryForward extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  keys = ['g', '>'];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const count = Math.max(vimState.recordedState.count, 1);
    const target = vimState.selectionHistory.forward(count);
    if (target !== undefined) {
      await showSnapshot(vimState, target);
    }
  }
}

/**
 * Goes back in the history of selections with `<C-o>` in Visual mode, where the jump list has nothing to jump to.
 * In Normal mode `<C-o>` stays the jump list, so the history is the jump list of the selections.
 */
@RegisterAction
class VisualSelectionHistoryBack extends SelectionHistoryBack {
  override modes = [Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  override keys = ['<C-o>'];
}

/**
 * Goes forward in the history of selections with `<C-i>` in Visual mode.
 */
@RegisterAction
class VisualSelectionHistoryForward extends SelectionHistoryForward {
  override modes = [Mode.Visual, Mode.VisualLine, Mode.VisualBlock];
  override keys = ['<C-i>'];
}
