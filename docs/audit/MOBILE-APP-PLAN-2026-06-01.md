# Plan — faire une app mobile en plus de l'extension Chrome — tezos-x-wallet

- **Repo / HEAD** : `trilitech/tezos-x-wallet`, branche `main` (origine : `dev` `e537352`, wallet 0.9.0 / relayer 0.5.1)
- **Date** : 2026-06-01 — **rafraîchi le 2026-06-25 contre `main`, wallet 0.12.0 / relayer 0.6.0**
- **Méthode** : 2 auditeurs (lecture de code) — refonte monorepo / cœur partagé + intégration plateforme mobile. Bâti sur l'audit d'extensibilité initial.
- **Convention** : *CONFIRMÉ* = lu dans le code ; *INFÉRÉ* = jugement d'ingénierie / connaissance lib.

---

## Δ depuis le 2026-06-01 (rafraîchi le 2026-06-25)

Le repo est passé de wallet 0.9.0 / relayer 0.5.1 à **0.12.0 / 0.6.0** (lots de tests, fixes sécurité denver #73–#77, migration `call`/`%call`). L'analyse et le plan phasé ci-dessous restent valides ; plusieurs prérequis ont déjà atterri. **Déjà fait :**
- ✅ **PBKDF2 200k → 600k** (`keyring.ts:55`, PR #77) — satisfait en partie la reco B.2 (reste Argon2id / vault v3 + **auto-lock**).
- ✅ **Garde sender du SW durcie** (`sw-wiring.ts:76-92`, PR #75) — n'est plus le simple `sender.id === chrome.runtime.id`, mais `sender.tab` (trafic dApp) + `sender.url` ⊂ `getURL('')` (pages d'extension). L'abstraction transport (A.6 étape 3) doit encapsuler **cette** logique.
- ✅ **`requestId` minté côté ISOLATED** (`content/bridge.ts:31`, PR #73) — la page ne choisit plus la clé de file d'approbation ; le transport mobile (WC / WebView) devra faire pareil.
- ✅ **Fondations test-vectors crypto** (KAT EIP-1559 / RLP / dérivation tz1 / crypto keyring) — voir B.3 ; le vecteur vault **cross-device** (chiffrer extension → déchiffrer mobile) reste à ajouter.

**Toujours TODO** (refactos [R] de Phase 1) : inverser l'injection d'adapters dans `container.ts` (toujours des singletons chrome au chargement de module, `76-81`), extraire `CryptoPort` + `ApprovalPresenter`, abstraire le transport de `dispatch`. **Aucun `packages/core` ni `packages/mobile` créé.**

**Surface élargie depuis 0.9.0** : 2 ports ajoutés — **`token-store.ts`** et **`clock.ts`** (cf. A.2) ; nouveaux fichiers `shared/` à inclure dans `core` — `log.ts`, `erc20-metadata.ts`, `seed-default-tokens.ts`, `e2e.ts`.

---

## Verdict

**Le portage est tractable** parce que l'archi est hexagonale propre : **0 référence `chrome.*`/`window`/`DOM`** dans `domain`, `use-cases`, `ports`, `adapters/evm`, `adapters/tezos`, et le cœur du relayer (CONFIRMÉ). ~**85 % du back-end hors UI est réutilisable**. Le travail mobile = **écrire de nouveaux adapters + un nouveau shell, réutiliser domain/use-cases/relayer** — pas réécrire le wallet.

**Calibration honnête** : le partage de code compresse la réutilisation du *moteur*, PAS la *delivery* mobile. Les 4 chantiers non-compressibles restent à plein coût : **stockage sécurisé, connectivité dApp (pas d'équivalent `window.ethereum`), réécriture UI, QA 2 OS + review store**. Le calendrier est piloté par ceux-là, pas par le moteur.

---

## A. Refonte monorepo & cœur partagé

### A.1 Forme cible : extraire `packages/core` (`@tezosx/wallet-core`)
Consommé par `packages/wallet` (extension) **et** un futur `packages/mobile`. **Ne pas** garder le cœur dans `packages/wallet` et cross-importer (sinon mobile hériterait de `react-dom`, `@crxjs`, `tailwindcss`, `@types/chrome`).

**Entre dans `core` (CONFIRMÉ propre)** : `domain/**` (~628 LOC), `use-cases/**` (~762), `ports/**` (~139), `shared/**` sauf `messaging.ts` (garde `seed.ts`, `evm-signing/*`, `constants.ts`, `format.ts`, `messages.ts`, `tx-status.ts`, `poller.ts`, `buffer-shim.ts`, et — ajoutés depuis 0.9.0 — `log.ts`, `erc20-metadata.ts`, `seed-default-tokens.ts`, `e2e.ts`), `adapters/evm/**` + `adapters/tezos/**` (~925), `background/keyring.ts` + `background/approval-queue.ts` (logique), `composition/container*.ts` + `sw-wiring.ts`, `ui/view-models/**` (CONFIRMÉ purs : importent seulement `domain/`, `ports/`, types `shared/messages`).

**Reste extension-only** : `adapters/chrome/**`, `background/service-worker.ts`, `content/bridge.ts`, `injected/provider.ts`, `shared/messaging.ts`, tout `ui/**` sauf `view-models/`, `manifest.json`, `*.html`, `vite.config.ts`.

**Imports qui cassent le split (à corriger d'abord)** :
1. **L'UI importe le cœur directement** (~30 fichiers, CONFIRMÉ : `ui/App.tsx`→`../domain/error`, `ui/pages/Send.tsx`→`@/domain/*`, `ui/pages/Connections.tsx`→`@/ports/session-store`…). → deviennent `@tezosx/wallet-core` ; scinder l'alias tsconfig `@/*` en `@core/*` + `@/*`.
2. **`container.ts` instancie les adapters chrome au chargement de module** (CONFIRMÉ lignes 76-81 : `new ChromeVaultStore()`/`ChromeSessionStore()`/`ChromeTokenStore()`/`ChromeNotificationPort()` en singletons + `persistentPorts` exporté ; `buildContainer` l.83). → inverser : `buildContainer` **reçoit** les `PersistentPorts` en argument ; `service-worker.ts` construit les adapters chrome et les injecte. **Changement structurel n°1, débloque tout le reste. (Toujours pas fait au 2026-06-25.)**
3. **`sw-wiring.dispatch` prend un `chrome.runtime.MessageSender`** (CONFIRMÉ lignes 71-75) + une garde sender (76-92) qui, depuis la PR #75, valide `sender.tab` pour `ETHEREUM_REQUEST` et `sender.url` ⊂ `chrome.runtime.getURL('')` pour les commandes privilégiées (plus le simple `chrome.runtime.id`). → la logique du routeur est réutilisable ; le type chrome **et cette garde** doivent être abstraits (transport port).
4. `relayer/src/index.ts` = seul fichier relayer couplé navigateur → laisser ; mobile importe via le `exports` map granulaire existant.

### A.2 Inventaire des ports (extension → mobile)
| Port | Adapter extension | Adapter mobile |
|---|---|---|
| `VaultStore` | `chrome-vault-store` (`chrome.storage.local`) | **NEW** : Keychain / SecureStore (blob déjà chiffré) |
| `SessionStore` | `chrome-session-store` | **NEW** : MMKV / AsyncStorage (métadonnées non-secrètes) |
| `TokenStore` *(ajouté depuis 0.9.0)* | `chrome-token-store` | **NEW** : MMKV / AsyncStorage (registre de tokens custom, non-secret) |
| `NotificationPort` | `chrome.action.setBadgeText` | **NEW** : no-op / `expo-notifications` |
| `SignerPort` | tezos/evm signers | **réutilisé tel quel** (noble/Taquito) |
| `ProviderPort` | RelayerProvider/EvmProvider | **réutilisé tel quel** |
| `BalanceFetcher` / `ActivityFetcher` | fetchers | **réutilisés tels quels** |
| `Clock` *(port concret `clock.ts` depuis 0.9.0)* | horloge système | **réutilisé** (source de temps injectable) |

**Fuites pas encore derrière un port (à extraire avant le split)** :
- **(a) Crypto pas derrière un port** : `keyring.ts` appelle directement `crypto.subtle`, `getRandomValues`, `btoa/atob`, `TextEncoder`, `randomUUID` (CONFIRMÉ 53-116, 390/394). → extraire un `CryptoPort` autour du vault.
- **(b) Le mécanisme de fenêtre d'approbation** : `approval-queue.ts` appelle `chrome.windows.create` (46), `chrome.runtime.getURL` (43). → la *logique* de queue est portable ; l'ouverture de fenêtre devient un port `ApprovalPresenter` (extension = popup, mobile = écran in-app).
- **(c) Transport/messaging** : `shared/messaging.ts` + le sender chrome. → `dispatch` prend `{ trusted: boolean }`, le transport est fourni par la plateforme. Sur mobile, UI et « backend » tournent dans le **même thread JS** → le split popup/SW disparaît, pas de message-passing.
- **(d) `broadcastEvent`** (`service-worker.ts` 21-31, `chrome.tabs`) → analogue mobile dépend du transport dApp (WC réémet, ou WebView post).

### A.3 Portabilité crypto (React Native — pas de WebCrypto)
| Lieu | Primitive | Fix RN |
|---|---|---|
| `keyring.ts:79-120` | `crypto.subtle` PBKDF2 600k + AES-GCM | **réimplémenter sur `@noble/hashes` (pbkdf2/argon2id) + `@noble/ciphers` (gcm)** — déjà dans l'arbre, pur-JS, format wire identique. (Alt : `react-native-quick-crypto`, natif, mais bloque Expo-managed.) |
| `keyring.ts:61` | `getRandomValues` | `react-native-get-random-values` (import en 1er) ou `@noble/hashes/utils randomBytes` |
| `keyring.ts:68,72`, `domain/activity.ts` | `btoa/atob` | `@scure/base` base64 ou `Buffer` |
| `keyring.ts:396,400` | `randomUUID` | polyfillé par get-random-values |
| evm-signing + keyring | `TextEncoder/Decoder` | polyfill `text-encoding` (Hermes récent l'a) |
| `buffer-shim.ts` | `Buffer` global (Taquito) | installer `buffer` à l'entry mobile |

Le gros de la crypto courbe (ed25519 Taquito/noble, secp256k1 `@noble/curves`) est **pur-JS et tourne sur Hermes** (INFÉRÉ établi).

### A.4 Gap connectivité dApp
Le modèle extension (inject `window.ethereum` via content-script) **n'a pas d'équivalent mobile**. Mais l'enveloppe de requête est transport-agnostique : tout transport doit juste produire `{type:'ETHEREUM_REQUEST', origin, requestId, args}` (`shared/messages.ts:101`) et appeler **`dispatch`** (`sw-wiring.ts:345-536`), qui fait déjà approval-gating + routage NAC + sessions.
- **Option A (recommandée) — WalletConnect v2** : transport qui mappe les requêtes WC sur l'enveloppe existante → `dispatch`. Events (`accountsChanged`/`chainChanged`) réémis via le point d'injection `SwDeps.broadcastEvent` (`sw-wiring.ts:55`). Net-new.
- **Option B — navigateur dApp in-app (WebView)** : réutilise `injected/provider.ts` (CONFIRMÉ chrome-free) quasi verbatim, remplace `window.postMessage`↔content-script par le bridge WebView. Couvre seulement les dApps ouvertes dans l'app.
- Les deux se branchent au même seam → le refactor A.2c sert les deux.

### A.5 Stratégie UI
Aujourd'hui `react-dom` 19 + `react-router-dom` `HashRouter` + Tailwind v4 → rien ne tourne sur RN. **Réutilisable** : les 4 view-models (`ui/view-models/*`, CONFIRMÉ purs) + helpers domain. **Réécriture complète** : `ui/pages/**` + `ui/tx/**` (~6500 LOC, DOM/Tailwind) → primitives RN (`View`/`Text`/`Pressable`) + `@react-navigation` à la place de `HashRouter`. **Ne pas** viser React-Native-Web (les composants sont écrits DOM+Tailwind, RNW = réécriture quand même). La vraie réutilisation = logique (view-models), pas pixels.

### A.6 Étapes séquencées ([R]=refacto pur, extension reste verte ; [N]=code neuf)
1. **[R]** Inverser la construction d'adapters dans `container.ts` (param au lieu de `new Chrome…`). *Débloque le split.*
2. **[R]** Extraire `CryptoPort` + réécrire la crypto vault sur `@noble` (format `EncryptedVault` préservé, **work-factor déjà à 600k depuis #77** ; vérifier le round-trip d'un vault existant). *(CryptoPort toujours pas extrait au 2026-06-25.)*
3. **[R]** Abstraire le sender/transport de `dispatch` (`{trusted}` au lieu du sender chrome ; la garde sender actuelle — `sender.tab` + `sender.url`⊂`getURL('')`, PR #75 — déplacée dans `service-worker.ts`).
4. **[R]** Extraire `ApprovalPresenter` de `approval-queue.ts` (logique en core, ouverture de fenêtre côté extension).
5. **[R]** Créer `packages/core`, déplacer les modules, `exports` map (modèle = relayer), scinder l'alias `@/*`, mettre à jour ~30 imports UI. Typecheck + vitest verts.
6. **[N]** Scaffold `packages/mobile` (RN/Expo-prebuild) : adapters `RnVaultStore`/`RnSessionStore`/notif, polyfills crypto, transport in-process. Objectif : unlock + balances on-device.
7. **[N]** Transport WalletConnect (chantier net-new dominant).
8. **[N]** UI RN (shell React Navigation, réutilise view-models + domain).

Étapes 1-5 = refactos purs qui **durcissent aussi l'extension** et peuvent atterrir avant tout code mobile.

---

## B. Intégration plateforme mobile

### B.1 Framework — **React Native bare (CLI communauté), PAS Expo-managed ; Expo seulement en couche outillage (prebuild/EAS)**
- Un wallet self-custody a besoin de modules natifs qu'Expo-managed gate (`react-native-keychain` Secure Enclave/StrongBox, push, éventuellement `react-native-quick-crypto`). **Expo + prebuild (CNG) + EAS Build** est acceptable (= projet bare + outillage Expo).
- `@noble`/`@scure` purs-JS tournent sur Hermes inchangés. **Taquito = point de friction** (attend `Buffer`/globals Node) — le repo a déjà `buffer` + shim, donc le pattern existe ; **smoke-tester `InMemorySigner` on-device en semaine 1**.
- **Rejeter** WebView-shell (Capacitor/Ionic) : réutiliserait l'UI DOM mais sape le modèle de menace (pas de stockage natif/biométrie).
- Risque : **medium, front-loaded** — le spike crypto-runtime + Taquito-signe-on-device est le go/no-go.

### B.2 Stockage sécurisé — **modèle 2 couches : garder le vault app-level, sceller son secret d'unlock dans le keystore OS derrière la biométrie**
Modèle actuel CONFIRMÉ : blob `{ciphertext, iv, salt, iterations}` PBKDF2(600k depuis #77)→AES-GCM-256, dans `chrome.storage.local` ; password en mémoire SW ; **toujours pas d'auto-lock**.
- Le menace mobile bascule vers **vol d'appareil + brute-force offline du blob**. Mobile apporte **keystore hardware** (Secure Enclave / StrongBox/TEE) + **biométrie**.
- **Recommandation** : (1) garder le vault AES-GCM tel quel (réutilise `domain/vault.ts`) ; (2) `VaultStore` sur **`react-native-keychain`** avec `accessControl: BIOMETRY_CURRENT_SET` + `accessible: WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` + `securityLevel: SECURE_HARDWARE` (Android) ; (3) unlock biométrique libère le secret keychain qui déchiffre le vault (password en fallback / re-auth export) ; (4) état non-secret (sessions/activity) sur **MMKV chiffré** / `expo-secure-store`.
- **Corriger les gaps audit ici (le menace mobile l'exige)** : ✅ work-factor déjà monté à **PBKDF2 600k** (#77) — reste à viser **Argon2id** memory-hard (le champ `iterations` permet le versioning → vault v3) ; **ajouter l'auto-lock** via `AppState` (le use-case `lock()` existe, il manque le déclencheur — toujours TODO au 2026-06-25).
- Risque : **élevé — c'est le cœur sécurité.** Le câblage lib = jours ; les flags d'access-control + fallback biométrique + migration KDF corrects et **validés sur vrais appareils** = non-compressible + revue sécurité.

### B.3 Runtime crypto — voir A.3 ; **exigence critique** : si on veut l'import de vault cross-device (extension ↔ mobile), la crypto mobile doit produire des résultats **byte-identiques** au `keyring.ts` (mêmes octets UTF-8 password, salt/IV base64, itérations, gestion tag GCM). **Suite de test-vectors cross-implémentation en CI** (chiffrer extension → déchiffrer mobile et inverse). Un mismatch silencieux = **fonds irrécupérables**. Travail non-compressible par nature. **Statut 2026-06-25 — partiellement amorcé** : KAT déjà en place côté extension — EIP-1559/RLP (`shared/evm-signing/__tests__/`), dérivation tz1 contre le vecteur alice (`shared/__tests__/seed.test.ts`), et crypto keyring (`background/__tests__/keyring-crypto.test.ts` : tamper AES-GCM, unicité salt/IV, garde version v2, upgrade-on-read). Le **vecteur vault cross-device** lui-même reste à écrire quand la crypto RN (`@noble`) atterrira.

### B.4 Connectivité dApp — **WalletConnect v2 d'abord, navigateur dApp in-app ensuite ; deep-links transverses**
- **(a) WalletConnect v2 (primaire)** : SDK wallet-side (Reown WalletKit), pairing QR/deep-link, chaque requête mappée sur l'enveloppe existante → file d'approbation + `provider.request`. Seul moyen pour les dApps **externes**. Events réémis via le seam `broadcastEvent`. Caveat dual-runtime : WC-over-EVM couvre le chemin Michelson+NAC comme l'extension (via `isTezosXRelayer`, CONFIRMÉ).
- **(b) WebView in-app (secondaire)** : réutilise `injected/provider.ts`, bridge `injectedJavaScriptBeforeContentLoaded` + `onMessage`. Pour dApps curées / first-party.
- **(c) Deep-links / universal-links (transverse, requis pour a)** : schéma `tezosx://` + Associated Domains (iOS) / App Links (Android) pour pairing same-device + callbacks.
- Risque : **élevé — plus grosse intégration mobile-spécifique** (cycle de vie sessions, expiry, reconnexion, mapping des méthodes). QA vrais-dApps. Non-compressible.

### B.5 UX d'approbation / signature — **modal in-app + confirmation biométrique remplace le popup ; push pour requêtes WC en arrière-plan**
- Remplacer `chrome.windows.create` par navigation/modal in-app ; `ApprovalQueue` devient une file mémoire pilotant un modal React Navigation, réutilisant les payloads (`connect`/`transaction`/`signature`) et l'UI Approve reconstruite en RN.
- **Confirmation biométrique au moment de signer** (libère le secret keychain) ; ne pas garder le password indéfiniment comme le SW (menace vol).
- **Push pour requêtes WC en arrière-plan** : **pas de service worker persistant** sur mobile (`service-worker.ts` sans analogue). Utiliser le **push relay WalletConnect (Echo) + FCM/APNs** ; tap notif → deep-link vers le modal. Contrainte OS (INFÉRÉ) : pas de socket WC long-vivant en background → push réveille l'app, qui reconnecte + rehydrate la session + déverrouille + montre l'approbation. Gérer le reject-on-expiry/dismiss (l'extension faisait reject-on-`onRemoved`).
- Risque : **élevé** — push + réveil background + rehydration de session = vraiment dur, OS-spécifique, QA appareils lourde.

### B.6 Contraintes store (INFÉRÉ — vérifier au moment de la soumission)
- **Self-custody (Apple 3.1.5(b))** : wallet non-custodial local OK, mais souvent **compte organisation** requis, pas d'achat fiat in-app. Google Play : politique crypto/financière + déclaration.
- **Strings biométrie** : `NSFaceIDUsageString` (iOS, obligatoire), permission `USE_BIOMETRIC` (Android).
- **Background modes** : iOS `remote-notification` pour le wake WC push ; ne pas déclarer de modes inutilisés.
- **Entitlements push** : APNs (capability + profil), FCM (config).
- **Limites OTA (CodePush/EAS Update)** : on peut hot-fix le **cœur JS** OTA, **pas les modules natifs** (keychain, quick-crypto, WC natif, push) → re-soumission store. Argument de plus pour garder la crypto vault en JS (A.3 option noble).

---

## C. Plan phasé (sépare réutilisation rapide vs delivery non-compressible)

| Phase | Contenu | Compressible ? |
|---|---|---|
| **0 — Spikes (1-2 sem, go/no-go)** | Boot RN/Hermes ; prouver `@noble`/`@scure`/**Taquito signe on-device** ; spike vault crypto + **test-vector décryptant un vault extension** | Non (validation) |
| **1 — Extraction cœur partagé** | `@tezosx/wallet-core` (domain/use-cases/ports/evm-signing/seed/view-models + relayer). Refacto pur via `ports/` | **Oui** |
| **2 — Adapters mobile + stockage sécurisé** | Fast : VaultStore/SessionStore/Notif sur MMKV/SecureStore. **Non-compressible** : keychain + access-control + biométrie + auto-lock + migration KDF (revue sécu) | Mixte |
| **3 — Reconstruction UI** | `ui/pages`+`ui/tx` en RN pilotés par view-models réutilisés ; React Navigation | Partiel |
| **4 — Connectivité dApp** | Transport WalletConnect v2 → dispatch+file ; deep-links ; puis WebView in-app | Non |
| **5 — UX approbation + push + background** | Modal + biométrie ; FCM/APNs + WC push ; rehydration cold-start | Non |
| **6 — Durcissement + store + QA 2 OS + review** | Root/jailbreak, screenshot/clipboard, audit sécu storage+crypto, entitlements, disclosures, matrice appareils, soumission | Non |

**MVP (code-complete)** = Phases 0-3 + WalletConnect de la 4 + modal basique de la 5 — compressible ~2-3× sur le volume de code (UI, adapters). **Production-ready** = ajoute push/background (5) + toute la 6, **dominée par audit sécu + QA vrais appareils + review store → ne compresse pas** ; c'est ça qui fixe le calendrier.

## D. Risques classés
1. **Cross-compat crypto vault + migration KDF** (A.3/B.2/B.3) — mismatch silencieux = fonds perdus ; test-vectors + revue obligatoires.
2. **WC background/push wake** (B.4/B.5) — intégration OS la plus dure ; races cold-start.
3. **Access-control secure-storage** (B.2) — mauvais flags = modèle sécu silencieusement affaibli.
4. **Taquito-on-Hermes** (B.1/B.3) — front-load en Phase 0.
5. **Review store wallet crypto** (B.6) — risque calendrier, pas ingénierie.

## E. Fichiers d'ancrage (où le fork mobile se branche)
`packages/wallet/src/ports/{vault-store,session-store,token-store,notification-port}.ts` (interfaces à ré-implémenter) ; `background/keyring.ts:59-122` (crypto vault à valider/migrer — PBKDF2 600k) ; `composition/container.ts:76-83` (câblage adapters à inverser) ; `composition/sw-wiring.ts:71-92` (garde sender) + `345-536` (`handleEthereumRequest`) (dispatch + routeur à réutiliser derrière un nouveau transport) ; `background/approval-queue.ts:55-62` (présentateur à extraire) ; `content/bridge.ts` (`requestId` minté l.31) + `injected/provider.ts` (transport EIP-1193 à remplacer par WC + bridge WebView) ; `ui/view-models/*` (seule UI réutilisable) ; `packages/relayer/package.json` exports map (modèle pour `core`).
