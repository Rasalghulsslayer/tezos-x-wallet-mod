import { Button } from '../../tx/Button';
import { toast } from '../../tx/Toast';

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
          void navigator.clipboard.writeText(value);
          toast('Copied');
        }}
      >
        Copy
      </Button>
    </div>
  );
}
