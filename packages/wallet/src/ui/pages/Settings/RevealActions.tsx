import { Button } from '../../tx/Button';
import { toast } from '../../tx/Toast';
import { copySecretWithAutoClear, CLIPBOARD_CLEAR_MS } from '@/shared/clipboard';

export function RevealActions({
  shown, onToggle, value,
}: {
  shown:    boolean;
  onToggle: () => void;
  value:    string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <Button variant="outline" onClick={onToggle}>{shown ? 'Hide' : 'Show'}</Button>
      <Button
        variant="accent"
        full
        onClick={() => {
          copySecretWithAutoClear(value);
          toast(`Copied — clears in ${Math.round(CLIPBOARD_CLEAR_MS / 1000)}s`);
        }}
      >
        Copy
      </Button>
    </div>
  );
}
