import styles from './Skeleton.module.css';

/** Card outlines plus a big --surface-2 button. No text, no spinner. */
export function Skeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.card} />
      <div className={styles.card} />
      <div className={styles.button} data-skeleton="button" />
    </div>
  );
}
