import { useEffect } from 'react';
import { useToastStore } from './toastStore';
import styles from './Toast.module.css';

export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.durationMs);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  return (
    <div className={styles.host} role="status">
      {toast ? (
        <div className={styles.toast} key={toast.id}>
          <span className={styles.message}>{toast.message}</span>
          {toast.actionLabel ? (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                toast.onAction?.();
                dismiss();
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
