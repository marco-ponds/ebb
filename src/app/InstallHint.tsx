import { Button } from '../components';
import { useInstallHint } from './installPrompt';

export const INSTALL_COPY = {
  ios: 'Tap Share, then Add to Home Screen.',
  manual: 'To install, open your browser menu and choose Install app or Add to Home screen.',
  insecure: 'To install Ebb, open it from a secure (https) link.',
} as const;

/** How to put Ebb on the home screen, for whichever route this browser has. Nothing once installed. */
export function InstallHint({ textClassName }: { textClassName?: string }) {
  const hint = useInstallHint();
  if (hint.kind === 'none') return null;
  if (hint.kind === 'prompt') {
    return (
      <Button variant="secondary" onClick={() => void hint.prompt?.()}>
        Install
      </Button>
    );
  }
  return <p className={textClassName}>{INSTALL_COPY[hint.kind]}</p>;
}
