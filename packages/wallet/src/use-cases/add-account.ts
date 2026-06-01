/**
 * addAccount: appends a new account to the unlocked vault. The new account
 * is not auto-activated — the SW caller wraps this with setActiveAccount.
 * For fresh sources, the returned `secret` is the generated mnemonic
 * (Tezos) or private key (EVM) so the UI can show the blurred-reveal screen.
 */

import type { Keyring } from '../background/keyring';
import type { AccountKind, AccountId, AddAccountSource, Account } from '../domain/account';

export interface AddAccountReq {
  kind:   AccountKind;
  source: AddAccountSource;
  label?: string;
}

export interface AddAccountDeps {
  keyring: Keyring;
}

export interface AddAccountResult {
  accountId: AccountId;
  account:   Account;
  secret?:   string;
}

export async function addAccount(req: AddAccountReq, deps: AddAccountDeps): Promise<AddAccountResult> {
  if (req.kind === 'tezos') {
    const { accountId, account, mnemonic } = await deps.keyring.addTezosAccount(req.source, req.label);
    return { accountId, account, secret: mnemonic };
  }
  const { accountId, account, privateKey } = await deps.keyring.addEvmAccount(req.source, req.label);
  return { accountId, account, secret: privateKey };
}