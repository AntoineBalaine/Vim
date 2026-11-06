import { Position } from 'vscode';
import { Mode } from '../../mode/mode';
import { cycleFocus, restoreAll } from '../../state/dormantCursors';
import { VimState } from '../../state/vimState';
import { BaseCommand, RegisterAction } from '../base';

/**
 * Moves the focus to another cursor, so that an edit changes that cursor alone. Kakoune has a plugin for it, phantom-selection.
 * The other cursors stay in the editor as dormant cursors, drawn with their own colors, until `g=` makes them active again.
 */
async function moveFocus(vimState: VimState, direction: 1 | -1): Promise<void> {
  const steps = Math.max(vimState.recordedState.count, 1) * direction;
  const focus = cycleFocus(vimState.cursors, vimState.dormantCursors, steps);
  vimState.dormantCursors = focus.dormant;
  vimState.cursors = focus.active;
}

@RegisterAction
class FocusNextCursor extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['g', ')'];

  // Because the focus moves for all the cursors at once, the command runs once and not once for every cursor.
  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await moveFocus(vimState, 1);
  }
}

@RegisterAction
class FocusPreviousCursor extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['g', '('];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    await moveFocus(vimState, -1);
  }
}

@RegisterAction
class RestoreDormantCursors extends BaseCommand {
  modes = [Mode.Normal, Mode.Visual, Mode.VisualLine];
  keys = ['g', '='];

  override runsOnceForEveryCursor() {
    return false;
  }

  public override async exec(position: Position, vimState: VimState): Promise<void> {
    if (vimState.dormantCursors.length === 0) {
      return;
    }
    const cursors = restoreAll(vimState.cursors, vimState.dormantCursors);
    vimState.dormantCursors = [];
    vimState.cursors = cursors;
  }
}
