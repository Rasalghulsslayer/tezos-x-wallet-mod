import { Icon } from '../../tx/Icon';

/**
 * Interception when leaving the input step with a revealed, un-backed-up
 * secret. Heavier than a toast, lighter than a page: the blurred backdrop
 * keeps the secret visible but unreachable, and the destructive verb sits on
 * the right — deliberately paired with an outline Stay, never two accents.
 */
export function DiscardOverlay({ onStay, onDiscard }: { onStay: () => void; onDiscard: () => void }) {
  return (
    <div className="tx-add-discard-overlay" role="dialog" aria-label="Discard the new key?">
      <div className="card">
        <span className="icon-wrap">
          <Icon name="alert" size={19} />
        </span>
        <h4>Discard the new key?</h4>
        <p>You've generated a fresh secret but haven't backed it up yet. Leaving now loses this key permanently.</p>
        <div className="row-btns">
          <button type="button" className="stay" onClick={onStay}>Stay</button>
          <button type="button" className="discard" onClick={onDiscard}>Discard</button>
        </div>
      </div>
    </div>
  );
}
