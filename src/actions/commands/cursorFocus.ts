import { Position } from 'vscode';
import { Mode } from '../../mode/mode';
import { cycleMain, cyclesCursors, makeSecondariesDormant } from '../../state/dormantCursors';
import { VimState } from '../../state/vimState';
import { BaseCommand, RegisterAction } from '../base';

/**
 * Makes another cursor the main one. Without dormant cursors every cursor stays active, as with ( and ) in Kakoune.
 * With dormant cursors, the main cursor is the only active one, as with the phantom-selection plugin of Kakoune.
 */
async function cycle(vimState: VimState, direction: 1 | -1): Promise<void> {
  const steps = Math.max(vimState.recordedState.count, 1) * direction;
  const focus = cycleMain(vimState.cursors, vimState.dormantCursors, steps);
  vimState.dormantCursors = focus.dormant;
  vimState.cursors = focus.active;
}

@RegisterAction
class MainCursorNext extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = [')'];

  // Because the cursors move together, the command runs once and not once for every cursor.
  override runsOnceForEveryCursor() {
    return false;
  }

  // Because ) is also the next sentence, it cycles the cursors only while there are several of them.
  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return cyclesCursors(vimState) && super.doesActionApply(vimState, keysPressed);
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await cycle(vimState, 1);
  }
}

@RegisterAction
class MainCursorPrevious extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['('];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return cyclesCursors(vimState) && super.doesActionApply(vimState, keysPressed);
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await cycle(vimState, -1);
  }
}

/**
 * Puts every selection except the main one to sleep with `gv` in Visual mode. <Esc> wakes them up again,
 * so that the time in between works like a sub-mode in which an edit changes only the main selection.
 */
@RegisterAction
class SleepSecondarySelections extends BaseCommand {
  modes = [Mode.Visual, Mode.VisualLine];
  keys = ['g', 'v'];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    const focus = makeSecondariesDormant(vimState.cursors);
    vimState.dormantCursors = [...vimState.dormantCursors, ...focus.dormant];
    vimState.cursors = focus.active;
  }
}
