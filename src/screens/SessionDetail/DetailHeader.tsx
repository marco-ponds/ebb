import { useRef, useState } from 'react';
import { ChevronLeft, Download, Pencil } from 'lucide-react';
import { goBack } from '../../app/router';
import { IconButton } from '../../components';
import type { Session } from '../../db/types';
import { renameSession } from '../../db/sessions';
import { formatDateShort, formatSessionLength, formatTimeRange } from '../../domain/format';
import { displayName } from '../../domain/naming';
import { useNow } from '../../lib/useNow';
import styles from './SessionDetail.module.css';

function TitleEditor({ session, now }: { session: Session; now: number }) {
  const [editing, setEditing] = useState(false);
  const done = useRef(false);
  const name = displayName(session, now);

  const finish = (save: boolean, value: string) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const next = value.trim() === '' ? null : value.trim();
    if (save && next !== session.name) void renameSession(session.id, next);
  };

  if (!editing) {
    return (
      <h1 className={styles.title}>
        <button
          type="button"
          className={styles.titleButton}
          aria-label={`${name}. Rename`}
          onClick={() => {
            done.current = false;
            setEditing(true);
          }}
        >
          <span className={styles.titleText}>{name}</span>
          <Pencil size={18} strokeWidth={2.2} className={styles.titleIcon} aria-hidden="true" />
        </button>
      </h1>
    );
  }
  return (
    <h1 className={styles.title}>
      <input
        className={styles.titleInput}
        aria-label="Session name"
        placeholder={name}
        defaultValue={session.name ?? ''}
        maxLength={60}
        // The person tapped the title to type, so focus belongs in the field.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => finish(true, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true, e.currentTarget.value);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            finish(false, '');
          }
        }}
      />
    </h1>
  );
}

export function DetailHeader({ session, onExport }: { session: Session; onExport: () => void }) {
  const now = useNow();
  const end = session.endedAt ?? now;
  return (
    <header className={styles.header}>
      <IconButton label="Back" icon={<ChevronLeft size={26} strokeWidth={2.4} aria-hidden="true" />} onClick={() => goBack('#/history')} />
      <div className={styles.titleBlock}>
        <TitleEditor session={session} now={now} />
        <p className={styles.sub}>
          {formatDateShort(session.startedAt)} · {formatTimeRange(session.startedAt, session.endedAt)} ·{' '}
          {formatSessionLength(end - session.startedAt)}
        </p>
      </div>
      <IconButton label="Export" icon={<Download size={22} strokeWidth={2.2} aria-hidden="true" />} onClick={onExport} />
    </header>
  );
}
