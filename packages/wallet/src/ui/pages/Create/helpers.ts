// The proportional confirmation positions live in core so both shells share
// one implementation; re-exported under the historical local name.
export { pickConfirmPositions as pickPositions } from '@tezosx/wallet-core/shared/seed';
