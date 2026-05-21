import { Icon } from '../../tx/Icon';

export function DiscardOverlay({ onStay, onDiscard }: { onStay: () => void; onDiscard: () => void }) {
  return (
    <div className="tx-add-discard-overlay" role="dialog" aria-label="Discard new account?">
      <div className="icon-wrap">
        <Icon name="alert" size={22} />
      </div>
      <h4>Discard the new key?</h4>
      <p>You've generated a fresh secret but haven't backed it up yet. Leaving now loses this key permanently.</p>
      <div className="row-btns">
        <button type="button" className="stay" onClick={onStay}>Stay</button>
        <button type="button" className="discard" onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}
