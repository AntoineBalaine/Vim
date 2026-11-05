import { Position } from 'vscode';
import { Cursor } from '../../common/motion/cursor';
import { Mode } from '../../mode/mode';
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
