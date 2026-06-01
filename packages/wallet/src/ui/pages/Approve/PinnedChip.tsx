import { AccountChip } from '../../tx/AccountChip';
import type { AccountContext } from './types';

export function PinnedChip({ ctx }: { ctx: AccountContext | null }) {
  if (ctx?.pinned == null) return null;
  return (
    <AccountChip
      account={ctx.pinned}
      fallbackLabel={ctx.fallbackLabel}
      activeAccountId={ctx.currentActive}
      showActiveDeltaHint
    />
  );
}
