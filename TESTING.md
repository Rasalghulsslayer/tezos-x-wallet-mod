# Testing the Tezos X Wallet extension

No Node, no npm — just Docker and Chrome.

## 1. Build the extension

```bash
git clone <repo-url> && cd Tezosx-relayer
docker compose run --rm wallet
```

This builds the extension in a container and drops it into `./wallet-dist`.

## 2. Load it in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `wallet-dist` folder

The wallet appears in the toolbar. You can also dock it as a side panel.

## 3. Get previewnet funds

The wallet targets **Tezos X previewnet** only. Create or import a wallet, copy
your `tz1` address, and claim test XTZ from the previewnet faucet. Balances,
sends (same- and cross-runtime) and the activity feed all run against live
previewnet data.

## 4. (Optional) Test against a dApp

```bash
docker compose up playground
```

Then open http://localhost:3000 — a small dApp to exercise the EIP-1193
connection, the Counter contract, and native transfers against the wallet.

## Reporting

This is experimental, previewnet-only software (see the banner). Please report
anything odd — UX friction included — in `#techrel-tezosx-mvp`, mentioning the
extension version shown in `chrome://extensions`.

## Notes

- Chrome shows a "developer mode extensions" warning at startup: expected for
  unpacked extensions, it disappears once the wallet ships through the Web Store.
- No auto-updates: to get a newer build, `git pull` and re-run step 1
  (then click the refresh icon on the extension card).
- Rebuilds are fast: Docker caches dependencies; only source changes rebuild.
