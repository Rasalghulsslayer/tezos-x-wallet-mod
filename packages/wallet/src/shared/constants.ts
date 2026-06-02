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

/**
 * Tenderbake finality on Tezos L1: a block is final after 2 attestation
 * rounds. Used by the L1 status poller (pollL1 in shared/tx-status.ts).
 *
 * Note: this constant is NOT used for L2 EVM finality — that path relies
 * on the `finalized` block tag from the Tezlink EVM RPC, which tracks the
 * actual L1 inclusion finality of L2 blocks (per Thomas Letan's feedback
 * on 2026-05-15, #techrel-tezosx-mvp).
 */
export const TEZOS_L1_FINALITY_BLOCKS = 2;

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

/** Custom-token registry caps + tuning. */
export const MAX_TOKENS_PER_ACCOUNT    = 30;
export const TOKEN_METADATA_TIMEOUT_MS = 5_000;

/**
 * Default tokens seeded into every account's registry on first 0.10.0 unlock
 * (CT4 wires the auto-seed step). In 0.10.0 the seed is just USDC; multi-token
 * seeding is straightforward via this array.
 */
export const DEFAULT_TOKENS_PER_RUNTIME = [
  {
    address:  USDC_CONTRACT.toLowerCase(),
    symbol:   'USDC',
    name:     'USD Coin',
    decimals: 6,
    builtin:  true,
  },
] as const;

/** Tezos X Previewnet chain ID — scoped in the token-registry storage key for forward-compat. */
export const PREVIEWNET_CHAIN_ID       = 128064;