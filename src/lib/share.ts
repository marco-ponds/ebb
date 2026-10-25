interface ShareNavigator extends Navigator {
  standalone?: boolean;
}

function isIosStandalone(): boolean {
  const nav = navigator as ShareNavigator;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent ?? '');
  const standalone =
    nav.standalone === true ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  return ios && standalone;
}

/** Saves a file by anchor download; on iOS standalone (no downloads) it uses the share sheet. */
export async function saveFile(blob: Blob, filename: string): Promise<'downloaded' | 'shared'> {
  if (isIosStandalone()) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
