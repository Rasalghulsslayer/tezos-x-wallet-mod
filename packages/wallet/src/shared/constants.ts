/** USDC deployed on Tezos X Previewnet. */
export const USDC_CONTRACT = '0xd77420F73B4612a7A99DBA8c2AFd30a1886b0344';

/** Faucet URL for users who need funds. */
export const FAUCET_URL = 'https://faucet.previewnet.tezosx.nomadic-labs.com/';

/** Blockscout explorer base URL (EVM runtime). */
export const EVM_EXPLORER = 'https://blockscout.previewnet.tezosx.nomadic-labs.com';

/** tzkt explorer base URL (Michelson runtime). */
export const TEZOS_EXPLORER = 'https://previewnet.tezosx.tzkt.io';

/** TzKT REST API base for Tezos X Previewnet (used for L1 op status). */
export const TZKT_API_BASE = 'https://api.previewnet.tezosx.tzkt.io';

/**
 * Background color of the toolbar badge when at least one approval
 * is pending. Mirrors --tx-purple from the design tokens.
 */
export const BADGE_BG_COLOR = '#a78bfa';

/** Number of confirmations to consider a transaction finalized. */
export const FINALIZED_AFTER_BLOCKS = 2;

/** Polling cadence for tx status, in milliseconds. */
export const TX_POLL_INTERVAL_FAST_MS = 2_000;
export const TX_POLL_INTERVAL_SLOW_MS = 5_000;

/**
 * Hard timeout for tx status tracking (after which we give up and
 * show "Status unavailable").
 */
export const TX_POLL_TIMEOUT_MS = 120_000;

/** Blockscout REST API base (account/txlist endpoint), distinct from the
 *  human-facing EVM_EXPLORER URL used for click-through links. */
export const BLOCKSCOUT_API_BASE = 'https://blockscout.previewnet.tezosx.nomadic-labs.com/api';

/** Activity tab pagination + auto-refresh tuning. */
export const ACTIVITY_PAGE_SIZE        = 25;
export const ACTIVITY_AUTO_REFRESH_MS  = 30_000;

/** Multi-account caps. */
export const MAX_ACCOUNTS_PER_VAULT    = 50;
export const MAX_LABEL_LENGTH          = 32;

/** SW container cache (LRU); each entry ~5–10 KB of JS. */
export const CONTAINER_CACHE_SIZE      = 16;