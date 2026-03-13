# Tezos X Relayer

EIP-1193 provider injectable qui expose `window.ethereum` à une dApp Etherlink, tout en routant les transactions via Temple Wallet et la gateway CRAC cross-runtime de Tezos X.

## Build

```bash
npm install
npm run typecheck   # vérification TypeScript sans compiler
npm run build       # produit dist/relayer.iife.js
```

## Injection dans une page de test

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Injecter le relayer AVANT tout script de la dApp -->
  <script src="dist/relayer.iife.js"></script>
</head>
<body>
  <script>
    // Test 1 : connexion → ouvre la popup Temple
    window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(accounts => console.log('Connected:', accounts));
      // Attendu pour bootstrap1 : ['0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2']

    // Test 2 : chainId
    window.ethereum.request({ method: 'eth_chainId' })
      .then(id => console.log('ChainId:', id));  // '0x1f094'

    // Test 3 : transaction → popup de signature Temple
    window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ to: '0xTargetContract', data: '0xa9059cbb...', value: '0x0' }]
    }).then(hash => console.log('TxHash:', hash));  // hash 32 bytes

    // Test 4 : receipt
    window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] })
      .then(r => console.log('Status:', r?.status));  // '0x1'
  </script>
</body>
</html>
```

Via DevTools (sans serveur) :

```js
const s = document.createElement('script');
s.src = 'dist/relayer.iife.js';
document.head.appendChild(s);
```

## Comptes bootstrap (testnet uniquement)

| Tezos tz1 | EVM alias dérivé |
|---|---|
| `tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx` | `0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2` |

La dérivation est effectuée via le RPC Tezos X `tez_getTezosEthereumAddress` — aucun mapping hardcodé.

## Configuration Temple Wallet

Dans Temple, ajouter le réseau custom :
- **RPC URL** : `https://demo.txpark.nomadic-labs.com/rpc/tezlink`
- **Nom** : `Tezos X Testnet`

## Infrastructure

| Endpoint | URL |
|---|---|
| EVM RPC (Tezlink) | `https://demo.txpark.nomadic-labs.com/rpc` |
| Tezos L1 RPC | `https://demo.txpark.nomadic-labs.com/rpc/tezlink` |
| CRAC Gateway | `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw` |

## Méthodes EIP-1193 supportées

| Méthode | Comportement |
|---|---|
| `eth_requestAccounts` | Ouvre Temple, dérive l'alias 0x via RPC, retourne `[evmAlias]` |
| `eth_accounts` | Retourne la session courante ou `[]` |
| `eth_chainId` | Proxy vers Tezlink (`0x1f094`) |
| `net_version` | `parseInt(chainId, 16).toString()` |
| `eth_getBalance` | Proxy vers Tezlink |
| `eth_getTransactionCount` | Retourne `'0x0'` (nonce non géré en V1) |
| `eth_sendTransaction` | Construit un appel CRAC Micheline → popup Temple → hash synthétique |
| `eth_getTransactionReceipt` | Tezlink d'abord, puis receipt synthétique depuis `pendingOps` |
| `eth_sign` / `personal_sign` / EIP-712 | Erreur `4200 UNSUPPORTED_METHOD` |

## Hors scope V1

- `eth_sign`, `personal_sign`, EIP-712 (SIWE)
- Packaging extension Chrome/Firefox
- Support Kukai / Umami
- Gestion du nonce réel
- UI de confirmation custom
