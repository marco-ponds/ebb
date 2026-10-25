import styles from './Wordmark.module.css';

/** The lowercase "ebb" mark: Nunito 900, lavender. */
export function Wordmark({ size = 'small' }: { size?: 'small' | 'large' }) {
  return (
    <span className={styles.mark} data-size={size}>
      ebb
    </span>
  );
}
