import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, goBack, navigate } from '../../app/router';
import { Button, IconButton } from '../../components';
import { useNow } from '../../lib/useNow';
import { useSessions } from '../../state/hooks';
import { useAppStore } from '../../state/store';
import { SessionCard } from './SessionCard';
import { LIMIT_HINT, canCompare, toggleSelection } from './select';
import { useSessionContractions } from './useSessionContractions';
import styles from './History.module.css';

export function HistoryScreen() {
  const sessions = useSessions();
  const byId = useSessionContractions();
  const active = useAppStore((s) => s.activeSession);
  const now = useNow();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);

  const toggleMode = () => {
    setSelectMode((m) => !m);
    setSelected([]);
    setBlocked(false);
  };
  const toggle = (id: string) => {
    const r = toggleSelection(selected, id);
    setSelected(r.selected);
    setBlocked(r.blocked);
  };
  const compare = () => navigate(`#/compare?ids=${selected.map(encodeURIComponent).join(',')}`);

  const empty = sessions !== undefined && sessions.length === 0;

  return (
    <main className={styles.screen} data-select-mode={selectMode}>
      <header className={styles.header}>
        <IconButton
          label="Back"
          icon={<ChevronLeft size={26} strokeWidth={2.4} />}
          onClick={() => goBack(active ? '#/live' : '#/')}
        />
        <h1 className={styles.heading}>Sessions</h1>
        {sessions && sessions.length > 0 ? (
          <Button variant="ghost" onClick={toggleMode}>
            {selectMode ? 'Done' : 'Select'}
          </Button>
        ) : null}
      </header>
      {selectMode ? <p className={styles.subtitle}>Pick two or three sessions to compare.</p> : null}

      {empty ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Sessions you time will appear here</p>
          <Link to="#/" className={styles.startLink}>
            Start timing
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {sessions?.map((s) => (
            <li key={s.id}>
              <SessionCard
                session={s}
                contractions={byId?.get(s.id) ?? []}
                now={now}
                selectMode={selectMode}
                selected={selected.includes(s.id)}
                onToggle={toggle}
              />
            </li>
          ))}
        </ul>
      )}

      {selectMode ? (
        <div className={styles.bar}>
          <div className={styles.barText}>
            <span className={styles.barCount}>{`${selected.length} selected`}</span>
            <span className={styles.hint} role="status">
              {blocked ? LIMIT_HINT : ''}
            </span>
          </div>
          <Button variant="primary" disabled={!canCompare(selected.length)} onClick={compare}>
            Compare
          </Button>
        </div>
      ) : null}
    </main>
  );
}
