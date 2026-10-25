import { Link } from '../../app/router';
import { Sheet } from '../../components';
import styles from './Live.module.css';

export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Menu">
      <nav className={styles.menu} aria-label="Menu">
        <Link to="#/history" className={styles.menuLink}>
          All sessions
        </Link>
        <Link to="#/settings" className={styles.menuLink}>
          Settings
        </Link>
      </nav>
    </Sheet>
  );
}
