import styles from './SafetyLine.module.css';

export function SafetyLine() {
  return (
    <p className={styles.line}>
      This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity
      unit.
    </p>
  );
}
