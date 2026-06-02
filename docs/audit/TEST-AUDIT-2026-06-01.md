# Audit de la base de test — tezos-x-wallet

- **Repo** : `trilitech/tezos-x-wallet`, branche `dev`
- **HEAD audité** : `e537352` — wallet 0.9.0 / relayer 0.5.1
- **Date** : 2026-06-01
- **Méthode** : 3 auditeurs en parallèle (lecture de code) **+ exécution empirique** de la suite (`npm ci` + `npm test -w @tezosx/wallet`, Node v22.15.0).
- **Convention de preuve** : *CONFIRMÉ* = lu/exécuté ; *INFÉRÉ* = déduit.
- Complément de `AUDIT-2026-06-01.md` (audit fonctionnel EVM/sécurité/mobile/features).

---

## TL;DR

1. **La suite ÉCHOUE aujourd'hui** : `101/102` passent, **1 timeout** (`multi-account › cap`, 5 s dépassés par 49 ré-encryptions PBKDF2). CONFIRMÉ par exécution.
2. **Le CI ne lance JAMAIS les tests** : `ci.yml` = lint + typecheck + build seulement. Aucune invocation vitest dans aucun workflow, aucun hook pre-commit. Les tests sont **décoratifs** → c'est pour ça que le timeout #1 n'a jamais été remarqué.
3. **`packages/relayer` = ZÉRO test** (1 518 LOC) — pourtant c'est le cœur NAC / synthetic-hash / provider EIP-1193, là où l'audit fonctionnel a trouvé H1-H4/M1-M3.
4. **Aucun known-answer crypto** : signatures EIP-191/712/1559, dérivation d'adresse, EIP-55, secp256k1 — les octets qui autorisent les mouvements de fonds ne sont vérifiés contre **aucun vecteur**.
5. Ce qui EST testé (domain/use-cases/view-models/activity) est **bien testé** ; la confiance s'effondre exactement aux coutures sensibles (signing, approval-gating, relayer).

---

## 0. Résultat empirique d'exécution (CONFIRMÉ)

```
Test Files  1 failed | 11 passed (12)
     Tests  1 failed | 101 passed (102)
  Duration  ~10 s
```

**Échec** : `src/use-cases/__tests__/multi-account.test.ts › addAccount use case › throws MaxAccountsReachedError at the cap`
→ `Error: Test timed out in 5000ms.`

**Cause (CONFIRMÉ)** : `MAX_ACCOUNTS_PER_VAULT = 50` (`shared/constants.ts:44`). Le test boucle 49 `addAccount`, et chaque ajout **ré-encrypte tout le vault** = un PBKDF2 200k (`keyring.ts:49,92`) + AES-GCM. Les tests qui passent montrent ~300-400 ms par opération de vault → 49 × ~350 ms ≈ 15-20 s ≫ timeout vitest par défaut (5 000 ms). Aucun `testTimeout` configuré. Échec **déterministe** sur cette machine ; dépend de la vitesse CPU (pourrait passer sur une machine très rapide, d'où la fragilité).

**Implications** :
- La suite n'est pas verte « out of the box » → quiconque la lance localement la voit rouge.
- Si on ajoute un job test au CI sans corriger ce test, le CI sera rouge d'emblée.
- **Correctifs possibles** : (a) `testTimeout` adapté sur ce test, (b) réduire le cap exercé / stubber la persistance pour ce cas, (c) baisser PBKDF2 en environnement de test via une constante injectable.

---

## 1. Cartographie

- **12 fichiers de test, ~1 320 LOC, tous Vitest, tous dans `packages/wallet`.** `packages/relayer` n'a ni `vitest.config.ts` ni script `test` ni fichier de test. CONFIRMÉ.
- Config : `vitest.config.ts` → `environment: 'node'`, `include: ['src/**/*.test.ts']`, `globals: false`, alias `@`→`src`. **Pas de bloc coverage, pas de setupFiles.** CONFIRMÉ.
- Scripts : `packages/wallet` → `"test": "vitest run"`. **Racine = aucun script `test`** (build/lint/typecheck seulement) → impossible de lancer toute la suite depuis la racine en une commande. `packages/relayer` → aucun script test.

| Fichier de test | LOC | Verdict qualité |
|---|---|---|
| `domain/__tests__/vault.test.ts` | 114 | **Fort** |
| `use-cases/__tests__/multi-account.test.ts` | 175 | **Fort** (mais 1 test timeout, cf §0) |
| `use-cases/__tests__/list-activity.test.ts` | 262 | **Fort** |
| `adapters/evm/__tests__/evm-activity-fetcher.test.ts` | 114 | **Fort** |
| `adapters/tezos/__tests__/tezos-activity-fetcher.test.ts` | 80 | Adéquat |
| `ui/view-models/__tests__/account-switcher-vm.test.ts` | 72 | **Fort** |
| `ui/view-models/__tests__/connections-vm.test.ts` | 68 | **Fort** |
| `ui/view-models/__tests__/activity-vm.test.ts` | 153 | Adéquat |
| `composition/__tests__/sw-wiring-multi-account.test.ts` | 170 | Adéquat (étroit) |
| `composition/__tests__/container-cache.test.ts` | 56 | Adéquat |
| `domain/__tests__/activity-cursor.test.ts` | 31 | Adéquat |
| `domain/__tests__/format-error.test.ts` | 25 | **Faible** |

---

## 2. Qualité des tests existants

### Bien fait (CONFIRMÉ)
- **Discipline de mock saine** : les fetchers stubbent `global.fetch` avec de vrais objets `Response` et reset via `vi.unstubAllGlobals()` en `beforeEach` (pas de fuite). `list-activity` ne mocke que la frontière relayer.
- **Crypto réelle exercée** : les tests multi-account / sw-wiring instancient le vrai `Keyring` → PBKDF2/AES-GCM/BIP-39 tournent réellement (haute fidélité). Le test « wrong password » exerce le vrai round-trip de déchiffrement, pas un mock.
- Pas de `.only`/`.skip`/`it.todo`, pas de tests commentés. Pas d'état mutable partagé entre tests (harness reconstruit par test).
- Couches domain + view-models genuinement bien testées avec assertions spécifiques (vault, dedup/staleness/pending d'activité, les 3 VMs, les 2 fetchers).

### Findings qualité

| # | Sév. | Problème | Preuve |
|---|------|----------|--------|
| Q0 | **Med** | Test en **timeout déterministe** (cf §0) — la suite est rouge | `multi-account.test.ts:60-72` |
| Q1 | Med | **Tout le chemin EIP-1193 / approval non testé** : `handleEthereumRequest` (gating approval, reject→4001, locked→4100, session upsert), garde sender-id `sender.id !== chrome.runtime.id`, gardes « wallet locked ». Une mutation inversant `if (decision === 'reject')` ou supprimant la garde sender passerait toute la suite | `sw-wiring.ts:73-74,283-387` (non couverts) |
| Q2 | Med | `format-error.test.ts` **superficiel** : 3 cas pour 30+ entrées `KNOWN_ERRORS` + 8 classifieurs regex + parser RPC Tezos. Le cas EIP-1193 = `expect(out.title).toBeTruthy()` → passe pour n'importe quel titre non-vide, ne détecterait pas un mapping faux (`4001`→« Wallet locked ») | `format-error.test.ts:16,22-23` ; `error.ts:127-194` |
| Q3 | Low | **Flake potentiel time-of-day** : le cas « failed / Yesterday » construit `ts = Date.now() - 25h` ; entre 00:00 et 01:00 locale, `dayGroupOf` renvoie `'Earlier'` → échec. Pas de `vi.useFakeTimers` | `activity-vm.test.ts:101-111` ; `activity-vm.ts:83-89` |
| Q4 | Low | Tautologie : `LIST_ACCOUNTS` vs `GET_STATE` asserte que deux chemins **concordent** (même source) plutôt que la correction de l'un ou l'autre | `sw-wiring-multi-account.test.ts:131-143` |
| Q5 | Low | `container-cache` : LRU réellement testé mais stubs opaques `{__label} as Container`, et capacités limites `0`/`1` + branche `oldest == null` non exercées | `container-cache.test.ts:5` ; `container-cache.ts:29-30` |
| Q6 | Info | EVM fetcher : test nommé « accepts input without 0x » mais l'assertion porte en réalité sur le quirk de troncature (`'test'`→`'tes'`) — nom légèrement trompeur | `evm-activity-fetcher.test.ts:107-113` |
| Q7 | Info | `list-activity` mocke `l1OpHashToEvmHash` / `deriveEvmAlias` du relayer ; la **vraie** dérivation cross-runtime (dont dépend la dedup) n'est testée nulle part — si son format changeait, la dedup casserait en silence | `list-activity.test.ts:14-19` |

### Pouvoir de détection (mutations concrètes)
- Inverser le tie-break createdAt-ASC dans `removeAccountFromPayload` (`vault.ts:70`) → **détecté**.
- Inverser la garde `payload.active === accountId` (`vault.ts:80`) → **détecté**.
- Supprimer la garde sender-id (`sw-wiring.ts:73`) → **NON détecté** (Q1).
- Inverser `if (decision === 'reject')` (`sw-wiring.ts:338`) → **NON détecté** (Q1).
- Mauvais mapping `eip1193:4001` (`error.ts`) → **NON détecté** (Q2).
- Changer le format de sortie de `l1OpHashToEvmHash` → **NON détecté** (Q7, mocké partout).

**Confiance globale** : modérée et inégale. Forte sur domain/use-cases/view-models (le gros de la suite) ; s'effondre aux coutures sensibles : approval EIP-1193 + garde sender (non testés), catalogue d'erreurs (3 tests superficiels), primitives cross-runtime relayer (mockées, jamais testées).

---

## 3. Lacunes de couverture (par risque)

> Ce qui EST testé = gestion d'état + logique de vue. Les parties dangereuses (signing, transfert cross-runtime, relayer entier, garde origin/approval, crypto) sont essentiellement **non vérifiées**.

### CRITIQUE — custody / correction de signature / transfert de valeur
1. **Primitives de signature EVM `shared/evm-signing/` — 0 test** (CONFIRMÉ) : `sign-transaction-1559.ts` (EIP-1559 brut, secp256k1, yParity), `sign-personal-message.ts` (EIP-191), `rlp.ts` (encodeur RLP fait main, 41 LOC), `derive-evm-account.ts` (secp256k1→keccak→checksum EIP-55). Ces octets bougent les fonds, jamais vérifiés contre un vecteur. → **Le bug H1 (`personal_sign` signe l'hex littéral) vit ici** : un seul known-answer EIP-191 sur le chemin provider le détecterait immédiatement.
2. **Signers réels `adapters/evm/evm-signer.ts`, `adapters/tezos/tezos-signer.ts` — 0 test** (CONFIRMÉ) : le signer EVM = frontière de custody. Le signer Tezos contient une math de frais branchue non triviale (`computeKernelFee`, `ceilNanotezToMutez`, `extractRequiredFee` avec heuristique `<1 ? ×1e6` = risque off-by-1e6) — tout non testé.
3. **Tout le relayer NAC `packages/relayer/src/**` — 0 test** (CONFIRMÉ) — plus forte concentration de logique de transfert de valeur cross-runtime, totalement nue :
   - `build-tezos-to-evm-call.ts:99-100` — **troncature wei→mutez** (`/1e12`, floor) ; dust silencieusement perdu. **Bug H4, non testé.**
   - `build-evm-to-tezos-call.ts` — inverse `×1e12` + mapping intent→`PrecompileCall` ; facteur inversé = mésenvoi.
   - `build-synthetic-receipt.ts:15-35` — **fabrique `status:'0x1'` (succès)** pour un op dont le tx réel est introuvable. **Bug M1, non testé.**
   - `resolve-synthetic-hash.ts:78-86` — match du **premier tx non réclamé** dont `from`/`to` = alias ; ops concurrents même alias → **mauvais hash**. **Bug M3, non testé.**
   - `tezos/provider.ts` (RelayerProvider, 388 LOC) — toute la surface RPC EIP-1193 (`eth_sendTransaction`, résolution receipt/hash, dedup in-flight, restore session, events). 0 test.

### HAUT — frontière de sécurité / crypto
4. **Crypto du keyring `background/keyring.ts` — exécutée mais NON assertée** (INFÉRÉ-fondé) : `encryptJson`/`decryptVaultRaw`/`deriveAesKey` *tournent* via les tests management, mais **aucun test n'asserte la correction crypto** : pas de rejet tamper AES-GCM, pas d'unicité salt/IV par save, pas de garde version `parseV2`, pas de mismatch mot de passe sur `removeAccount` (ligne 287).
5. **Gating approval/origin/disclosure de sw-wiring — branches dangereuses nues** (CONFIRMÉ) : `eth_accounts` **absent du set `needsApproval`** (`sw-wiring.ts:286-290`) → tombe dans `container.provider.request()` et **divulgue l'adresse sans connexion** (bug F3, branche non testée). Flow enqueue/reject, rebuild `pinnedAccountId`, « compte retiré avant approbation », garde sender-id, upsert session — non assertés.
6. **`shared/seed.ts` (BIP-39→tz1) et `nac-precompile-builder.ts` — 0 test** (CONFIRMÉ) : dérivation de clé Tezos contre vecteur connu non vérifiée.

### MOYEN
7. `background/service-worker.ts`, `content/bridge.ts`, `injected/provider.ts`, `adapters/chrome/*`, `*-balance-fetcher.ts` — 0 test. Aucun test du pont de messages content↔background↔injected (et l'env node ne peut pas l'héberger sans setup).
8. Use-cases restants (`send-transfer`, `resolve-tx`, `import-account`, `export-secret`…) — non testés sauf hit indirect.

### Intégration / e2e / crypto vectors
- **Aucun e2e** (pas de Playwright/Puppeteer) ; **aucun test d'intégration** (adapters réels câblés ensemble) ; **aucun test de contrat/RPC**. CONFIRMÉ.
- **Aucun known-answer crypto** (EIP-191/712/1559, secp256k1, EIP-55) — `grep` = 0. **C'est la plus grosse lacune qualitative.**

### Si on ajoute des tests, dans cet ordre
1. **Known-answer EIP-191 sur le chemin `personal_sign`** (provider → `EvmSigner` → `signPersonalMessage`) — détecte le bug H1, pin la primitive la plus à risque.
2. **Vecteur EIP-1559 brut** pour `sign-transaction-1559.ts` + `rlp.ts` (data vide / leading-zero / access-list) + **vecteur EIP-55 + secp256k1** pour `derive-evm-account.ts`.
3. **Conversions de valeur + résolution receipt/hash du relayer** : bornes wei→mutez & mutez→wei ; `resolve-synthetic-hash` deux-ops-concurrents-même-alias ; assertion de succès forgé `build-synthetic-receipt`.
4. **Assertions crypto keyring** : mauvais mot de passe rejette, tamper AES-GCM rejette, salt/IV distincts par save, garde version `parseV2`.
5. **Gating sw-wiring** : `eth_accounts` doit exiger une connexion (bug F3) ; branches reject/`pinnedAccountId`/sender-id ; assertion « `eth_signTypedData_v4` signe réellement ».
6. **Un flow e2e** (unlock→approve→sign→send) contre un RPC mock + test unitaire math de frais `tezos-signer.ts`.

---

## 4. Infrastructure & CI

### Headline — [Med] Le CI ne lance jamais les tests
`.github/workflows/ci.yml` = 7 jobs : `lint`, `typecheck-{relayer,wallet,website}`, `build-{relayer,extension,wallet}`. **Aucun n'invoque vitest** (CONFIRMÉ : `grep -rniE 'vitest|npm (run )?test|coverage' .github/` = vide). Le seul script `test` du repo (`packages/wallet`) n'est appelé par aucun pipeline/hook. → Les 12 fichiers de test sont des artefacts de doc/dev local ; une régression cassant un test (y compris les bugs H1/H4 de l'audit fonctionnel) **mergerait au vert** tant que ça typecheck et lint. **Protection de merge = zéro.**

### Faits à l'appui (CONFIRMÉS)
- Aucun hook pre-commit : pas de `.husky/`, `.githooks/`, pas de dep `husky`/`lint-staged`/`simple-git-hooks` ; `core.hooksPath` non défini.
- Racine sans script `test` → pas de commande unique depuis la racine.
- `packages/relayer` : 0 test, 0 script test.

### Coverage — absent (CONFIRMÉ)
- Pas de dep `@vitest/coverage-v8`/`-istanbul`, pas de bloc `coverage`, pas de seuil.
- Estimation qualitative (INFÉRÉ) : tests sur `domain`/`use-cases`/`composition`/`ui/view-models` + 2 fetchers seulement. `background 0`, `adapters/chrome 0`, `injected 0`, `content 0`, `shared 0` fichiers de test. Couverture risque-pondérée sur ~12.7k LOC plausiblement en **bas de la fourchette (~5-10 %)**, concentrée sur la logique pure.

### Fidélité d'environnement — INFO/LOW (sûr aujourd'hui, fragile)
- `environment: 'node'`, pas de setupFiles, pas de shim `chrome.*`, pas de polyfill crypto, pas de `jsdom`/`happy-dom` installé.
- **OK actuellement** car les tests n'exercent que des fonctions pures (vault opère sur objets payload, fetchers stubbent `fetch`, sw-wiring utilise `{} as MessageSender`).
- **Risque (INFÉRÉ)** : plafond structurel. Tout futur test important un module touchant `chrome.*`, `crypto.subtle`, `indexedDB` ou React-DOM échouera à l'import ou exigera des shims absents → c'est *pourquoi* la couverture des zones sensibles est nulle, pas un hasard.

### Filet lint/typecheck (seul enforced)
- tsconfig (wallet+relayer) : `strict: true`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, `isolatedModules`. **Mais `noUncheckedIndexedAccess` NON activé** (source classique de bugs `undefined` runtime). Pas de tsconfig racine.
- `eslint.config.mjs` : `no-explicit-any: error`, `no-unused-vars/expressions: error`, `react-hooks/rules-of-hooks: error`, type-aware. Solide pour l'hygiène, mais **ne remplace pas les tests** — les bugs H1/H4 sont du TS parfaitement valide qui lint clean.

### Types de tests manquants (CONFIRMÉ absents)
- Pas d'e2e/extension (Playwright/Puppeteer) — flows critiques MV3 (popup approval, pont content↔injected↔SW, round-trips EIP-1193 `request`) non couverts.
- Pas d'intégration (adapters réels câblés). Pas de tests de contrat/RPC (couverture/forme des méthodes EIP-1193, contrats RPC Tezos contre fixtures).

### Recommandations infra (priorisées)
1. **Ajouter un job `test` au CI** (valeur max, effort min) — `npm test -w @tezosx/wallet`, et faire dépendre `build-wallet` de lui. ⚠️ corriger Q0 d'abord (ou relever `testTimeout`), sinon CI rouge immédiat.
2. **Script `test` agrégé à la racine** (runnable en une commande, réutilisable CI/hooks).
3. **Script test + smoke tests relayer** (mirror `vitest.config.ts` du wallet) — c'est le hotspot H3/M1.
4. **Coverage + seuil souple** (`@vitest/coverage-v8`, gate initial bas ~25-30 % avec ratchet) pour rendre visibles `background/`, `adapters/chrome/`, `injected/`, `content/`.
5. **Shims d'environnement** (setupFiles : mock `chrome.*`, garder `crypto.subtle` de node) pour débloquer le test de `keyring.ts`, `chrome-vault-store.ts`, messaging.
6. **Harness e2e Playwright** pour approval + round-trip provider.
7. **Durcissement optionnel** : `noUncheckedIndexedAccess: true` ; `afterEach(vi.unstubAllGlobals)` dans les tests qui stubbent fetch.

---

## Annexe — fichiers clés
- Test rouge : `packages/wallet/src/use-cases/__tests__/multi-account.test.ts:60-72`
- Path sécurité non testé : `packages/wallet/src/composition/sw-wiring.ts:73,283-387`
- Sous-testé : `packages/wallet/src/domain/error.ts:127-194`
- Frontière relayer mockée : `packages/wallet/src/use-cases/__tests__/list-activity.test.ts:14-19`
- Relayer non testé (cœur NAC) : `packages/relayer/src/tezos/provider.ts`, `.../use-cases/{build-tezos-to-evm-call,build-evm-to-tezos-call,build-synthetic-receipt,resolve-synthetic-hash}.ts`
- Primitives signing non testées : `packages/wallet/src/shared/evm-signing/{sign-personal-message,sign-transaction-1559,rlp,derive-evm-account}.ts`
- CI sans test : `.github/workflows/ci.yml`
