import { Plus, Share, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button, SummarySheet, showToast } from '../../components';
import { discardContraction } from '../../db/contractions';
import { undoWithFeedback } from '../../lib/undoFeedback';
import { summaryText } from '../../domain/summary';
import { useUndoAvailable } from '../../state/hooks';
import { DIDNT_SAVE } from './rating';
import { EventSheet } from './EventSheet';
import styles from './Live.module.css';
import type { LiveSlotContext } from './slots';

/** Undo (or Started by mistake while contracting) / Event / Share. */
export function ActionRow(ctx: LiveSlotContext) {
  const { activeContraction, session, contractions, events, now } = ctx;
  const undoAvailable = useUndoAvailable();
  const [eventOpen, setEventOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const undo = () => {
    if (!undoAvailable) return;
    void undoWithFeedback();
  };

  return (
    <>
      <div className={styles.actionRow} data-contracting={activeContraction ? 'true' : 'false'}>
        {activeContraction ? (
          <Button variant="secondary" className={styles.action} onClick={() => discardContraction(activeContraction.id).catch(() => showToast({ message: DIDNT_SAVE }))}>
            <Undo2 size={22} strokeWidth={2.2} aria-hidden="true" />
            Started by mistake
          </Button>
        ) : (
          <Button variant="secondary" className={styles.action} aria-disabled={!undoAvailable} onClick={undo}>
            <Undo2 size={22} strokeWidth={2.2} aria-hidden="true" />
            Undo
          </Button>
        )}
        <Button variant="secondary" className={styles.action} onClick={() => setEventOpen(true)}>
          <Plus size={22} strokeWidth={2.2} aria-hidden="true" />
          Event
        </Button>
        {activeContraction ? null : (
          <Button variant="secondary" className={styles.action} onClick={() => setShareOpen(true)}>
            <Share size={22} strokeWidth={2.2} aria-hidden="true" />
            Share
          </Button>
        )}
      </div>
      <EventSheet open={eventOpen} onClose={() => setEventOpen(false)} sessionId={session.id} />
      <SummarySheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        text={
          shareOpen
            ? summaryText({ contractions, events, now, scope: 'last-hour', sessionStart: session.startedAt, sessionEnd: null })
            : ''
        }
      />
    </>
  );
}
