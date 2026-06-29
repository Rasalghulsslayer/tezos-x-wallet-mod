/**
 * addAccount: appends a new account to the unlocked vault. The new account
 * is not auto-activated — the SW caller wraps this with setActiveAccount.
 * For fresh sources, the returned `secret` is the generated mnemonic
 * (Tezos) or private key (EVM) so the UI can show the blurred-reveal screen.
 */

import type { Keyring } from '../background/keyring';
import type { AccountKind, AccountId, AddAccountSource, Account } from '@tezosx/wallet-core/domain/account';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';
import { seedDefaultTokensForAccount } from '@tezosx/wallet-core/shared/seed-default-tokens';

export interface AddAccountReq {
  kind:   AccountKind;
  source: AddAccountSource;
  label?: string;
}

export interface AddAccountDeps {
  keyring:    Keyring;
  tokenStore: TokenStore;
}

export interface AddAccountResult {
  accountId: AccountId;
  account:   Account;
  secret?:   string;
}

export async function addAccount(req: AddAccountReq, deps: AddAccountDeps): Promise<AddAccountResult> {
  const result = req.kind === 'tezos'
    ? await deps.keyring.addTezosAccount(req.source, req.label).then((r) => ({ accountId: r.accountId, account: r.account as Account, secret: r.mnemonic }))
    : await deps.keyring.addEvmAccount(req.source, req.label).then((r) => ({ accountId: r.accountId, account: r.account as Account, secret: r.privateKey }));
  await seedDefaultTokensForAccount(result.accountId, deps.tokenStore);
  return result;
}