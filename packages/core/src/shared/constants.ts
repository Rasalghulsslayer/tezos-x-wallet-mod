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
 * rounds. Used by the L1 status poller. L2 finality uses the `finalized`
 * block tag from the Tezlink EVM RPC instead — see shared/tx-status.ts.
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

/** Polling cadence and give-up deadline for resolving a cross-runtime
 *  synthetic hash into the kernel-synthesized EVM hash. */
export const TX_RESOLVE_POLL_MS    = 2_000;
export const TX_RESOLVE_TIMEOUT_MS = 60_000;

/**
 * Mutez kept aside when the user hits "Max" on an XTZ send, so the transfer
 * still has room for its own fee instead of failing on balance_too_low.
 */
export const MAX_FEE_RESERVE_MUTEZ = 10_000n;

/** How long a copied secret may sit in the clipboard before it is cleared
 *  (unless the user has since copied something else). */
export const CLIPBOARD_CLEAR_MS = 30_000;

/** Wallet inactivity budget before the keyring auto-locks, on both shells. */
export const AUTO_LOCK_IDLE_MS = 5 * 60_000;

/**
 * Extra inactivity allowed PAST `AUTO_LOCK_IDLE_MS` while a dApp approval is
 * still on screen.
 *
 * Why it exists: a 25-operation ceremony asks the operator to read and confirm
 * each operation in turn, and one of them carries ~38 kB of undecoded Micheline.
 * Reading that carefully means minutes of no input, and `chrome.idle` measures
 * input across the whole machine, not attention. Without this, auto-locking
 * called `rejectAll()` on the prompt the operator was in the middle of reading
 * and ended the run — a ceremony killed by the operator being careful.
 *
 * Why it is a GRACE and not a hold: the budget is derived from the same
 * `lastActivity` stamp, so this is an absolute ceiling of
 * `AUTO_LOCK_IDLE_MS + AUTO_LOCK_PENDING_GRACE_MS` since the last wallet
 * interaction — 15 minutes — and NOT a window a page can renew by keeping a
 * prompt open. That distinction is the whole security argument: a pending
 * approval extends the deadline once, by a bounded amount, and can never
 * suspend it.
 *
 * ⚠️ THIS IS A DELIBERATE WEAKENING, STATED PLAINLY: any origin that can get one
 * approval prompt on screen extends the unlocked-idle window from 5 to 15
 * minutes. An explicit screen lock is deliberately NOT covered by it — see the
 * `chrome.idle` wiring, which locks on `'locked'` regardless.
 */
export const AUTO_LOCK_PENDING_GRACE_MS = 10 * 60_000;

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

/** Deadline for read-path RPC/REST calls (balances, activity). Signing and
 *  injection paths are deliberately excluded — aborting after broadcast is
 *  worse than waiting. */
export const RPC_READ_TIMEOUT_MS       = 15_000;

/** Address-book cap (wallet-global — contacts are the user's, not an account's). */
export const MAX_CONTACTS              = 50;

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