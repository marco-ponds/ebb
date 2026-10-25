import { showToast } from '../components';
import { undoLast } from '../db/undo';

/** Quiet feedback for a write that was refused. */
export const DIDNT_SAVE = "That didn't save — try again.";

/** Undoes the last change and says so: "Undone" on success, the quiet failure line if the write was refused. */
export function undoWithFeedback(): Promise<void> {
  return undoLast()
    .then((kind) => {
      if (kind) showToast({ message: 'Undone', durationMs: 3000 });
    })
    .catch(() => {
      showToast({ message: DIDNT_SAVE });
    });
}
