# Audit de sécurité — production mainnet — tezos-x-wallet

- **Repo / HEAD** : `trilitech/tezos-x-wallet`, branche `dev`, `e537352` (wallet 0.9.0 / relayer 0.5.1)
- **Date** : 2026-06-01
- **Hypothèse** : déploiement **production mainnet, custody de fonds réels**. Sévérités calibrées en conséquence (≠ le premier audit, calibré POC).
- **Méthode** : 3 auditeurs adversariaux en parallèle (lecture de code), bâtissant sur `AUDIT-2026-06-01.md` + `TEST-AUDIT-2026-06-01.md`.
- **Convention** : *CONFIRMÉ* = lu dans le code ; *INFÉRÉ* = raisonné, non exécuté.

---

## Verdict global

**PAS prêt pour un déploiement mainnet.** Deux constats :

1. **Le confinement est bon** : pas d'`externally_connectable`, type de message hardcodé (`ETHEREUM_REQUEST`), CSP serré (`script-src/object-src 'self'`, `frame-ancestors 'none'`), UI d'approbation anti-framing, crypto de signature auditée (`@noble`/`@scure`), aucun script `postinstall`. La frontière de message tient — une page hostile **ne peut pas** atteindre les handlers privilégiés (UNLOCK/EXPORT_SEED/gestion de comptes).

2. **Mais le modèle d'autorisation et l'intégrité de signature sont les trous** : « se connecter » n'est pas un gate appliqué (toute origine atteint la surface de signature d'un wallet déverrouillé), et la présentation de ce qui est signé diverge de ce qui est signé sur plusieurs chemins (blind-signing). À cela s'ajoute une gestion de clés **testnet-grade**, pas état de l'art.

---

## RÉPONSE DIRECTE : la gestion des clés est-elle « state of the art » ?

**Non. C'est un hot wallet logiciel de qualité testnet, pas un système de custody mainnet état-de-l'art.**

Les **primitives cryptographiques sont solides** (la partie forte du design) :
- AES-256-GCM via WebCrypto, **salt + IV aléatoires régénérés à CHAQUE save** → pas de réutilisation de nonce GCM (le mode d'échec catastrophique est évité). IV 96-bit, salt 128-bit, tag 128-bit. CONFIRMÉ (`keyring.ts:80-99`).
- BIP-39 256-bit / 24 mots via `@scure/bip39` (CSPRNG). tz1 via SLIP-10 ed25519 `m/44'/1729'/0'/0'`. EVM secp256k1 + keccak + EIP-55, `@noble`. CONFIRMÉ.
- **Séparation de courbes parfaite** : les clés EVM sont des clés aléatoires indépendantes (`freshEvmPrivkeyHex`), jamais dérivées du même seed que les clés Tezos → **zéro réutilisation cross-courbe**. CONFIRMÉ.
- Clés WebCrypto `extractable:false` ; aucun secret loggé ; aucun matériel de clé en clair sur disque/logs. CONFIRMÉ.

Mais **l'enveloppe opérationnelle est sous la barre sur trois axes qui se cumulent** :

| Axe | État | Détail |
|---|---|---|
| **KDF** | **Sous la barre (quasi-critique)** | PBKDF2-SHA256 **200 000** itérations (`keyring.ts:49`) = ~**3× sous le plancher OWASP 2023** (600k) et surtout **pas memory-hard**. La vraie barre = scrypt/Argon2id (MetaMask : PBKDF2 600k-900k ; 1Password/Bitwarden : Argon2id). PBKDF2-SHA256 est la cible la moins chère pour un attaquant GPU/ASIC. Avec un mdp min 8 caractères sans règle de complexité (`keyring.ts:167`), un vault volé (`chrome.storage.local`, persisté sur disque) avec un mdp humain typique (~30 bits) est crackable en **heures-à-un-jour sur un seul GPU**, minutes sur un cluster. Le mdp — pas le KDF — est le maillon faible, et le KDF faible supprime la marge qu'un KDF memory-hard aurait donnée. *Bon réflexe : `iterations` est stocké par-vault → upgradeable.* |
| **Auto-lock / anti-bruteforce** | **Critique** | **Aucun auto-lock / idle timeout / lock-on-screen.** Le seul lock est manuel + l'éviction non-déterministe du SW par Chrome. Un wallet déverrouillé sur une machine non surveillée reste ouvert. **Aucun throttling / lockout / backoff** sur l'unlock (`keyring.ts:191-208`) → guessing en ligne borné seulement par le coût PBKDF2. CONFIRMÉ. |
| **Hygiène mémoire** | **Sous la barre** | Pendant tout le déverrouillage, le SW garde simultanément en clair : la clé de signature, **les mnémoniques/edsk/evm-pk** (`payload.secrets`) ET **le mot de passe en clair** (`keyring.ts:44-47,206`). Rien n'est zeroizé. Le mdp est caché pour éviter de re-prompt sur add/rename (`keyring.ts:1-6`) — strictement pire que MetaMask (qui garde une clé dérivée, pas le mdp brut). Toute compromission du runtime déverrouillé = **tout** récupéré. CONFIRMÉ. |

**Pièce manquante majeure (posture)** : **aucun support hardware-wallet (Ledger/Trezor), aucun secure-enclave / keystore OS, aucun MPC / recovery social.** Pur hot wallet logiciel : une seule compromission du runtime de l'extension = perte totale et irrécupérable. La barre mainnet pour de la valeur élevée = signature hardware (les clés ne quittent jamais le device) et/ou MPC.

**Piège recovery (CONFIRMÉ, à signaler fort)** : comme les clés EVM sont aléatoires indépendantes (et non dérivées du seed), **la phrase de 24 mots ne restaure PAS les comptes EVM**. Un utilisateur qui restaure depuis sa mnémonique perd toutes ses clés privées EVM. Ce n'est pas une faille crypto mais un risque backup/UX majeur ; idéalement passer à une dérivation HD `m/44'/60'/0'/0/i` depuis le même seed.

### Scorecard gestion de clés

| Axe | Verdict |
|---|---|
| KDF (PBKDF2 200k) | 🔴 Sous la barre |
| Cipher / AEAD (AES-256-GCM) | 🟢 SOTA (point fort) |
| Cycle de vie / hygiène mémoire | 🔴 Sous la barre |
| Stockage (chrome.storage.local) | 🟡 Sous la barre (hérite du KDF faible ; hygiène sinon correcte) |
| Seed & dérivation | 🟢 SOTA / 🟡 (recovery EVM = warning) |
| Durcissement unlock (auto-lock, throttle) | 🔴 Critique |
| Export / backup | 🟡 Auth-gating correct ; surface presse-papier/screenshot non vérifiée (UI) |
| HW wallet / enclave / MPC | 🔴 Absent (choix de posture à assumer) |

### Ce qui DOIT changer avant mainnet (gestion de clés)
1. **Auto-lock** (idle + lock-on-sleep), défaut ≤ 5-15 min. *(Critique)*
2. **Renforcer le KDF** : Argon2id (idéal) ou a minima PBKDF2 ≥ 600k (le champ `iterations` permet l'upgrade transparent). *(Critique mainnet)*
3. **Ne plus cacher le mdp brut** en mémoire SW : ne garder qu'une clé dérivée non-extractable (modèle MetaMask). *(Haut)*
4. **Throttling / lockout** sur l'unlock (backoff exponentiel + lock temporaire après N échecs). *(Haut)*
5. **Support Ledger/HW** pour tout compte à valeur réelle, OU décision de posture explicite « hot wallet — pas pour de gros soldes » assumée par l'équipe. *(Critique)*
6. **Politique de mot de passe** ≥ 12 + zxcvbn. *(Haut, car le KDF faible rend le mdp dominant)*
7. **Audit de l'UI export/backup** (presse-papier, screenshot, masquage par défaut). *(Moyen)*

### Nice-to-have
- AAD liant le ciphertext à la version/usage ; authentifier le champ `iterations`.
- Zeroization best-effort des buffers transitoires (`Uint8Array.fill(0)`).
- Compare constant-time pour le check mdp de `removeAccount` (`keyring.ts:287`, actuellement `!==`).
- Dérivation HD EVM depuis le seed (sinon avertir que le seed ne restaure pas l'EVM).
- Unifier les deux chemins de keygen EVM (`freshEvmPrivkeyHex` vs `randomEvmPrivateKey`) sur celui qui valide la plage.

---

## Findings signing & transfert de valeur (risque perte/mésorientation de fonds)

### CRITIQUE

**C1 — `personal_sign` : affiché ≠ signé (EIP-191 cassé, exploitable). [CONFIRMÉ] — H1 ⬆ Critique.**
L'UI affiche le texte UTF-8 décodé (`sw-wiring.ts:323-332` ; `SignatureView.tsx:49`), mais le signer encode la **chaîne hex littérale** (`evm-provider.ts:57-60` → `sign-personal-message.ts:14-16`). Deux défauts cumulés : (a) toutes les signatures EIP-191 sont **fausses** (SIWE/ordres/meta-tx échouent) ; (b) **affiché ≠ signé** — une dApp malveillante envoie un hex qui décode en texte anodin alors que le préimage réellement signé est choisi par l'attaquant. La note de l'UI rassure même sur « payload brut 0x… », renforçant la confiance. Vecteur de vol partout où une signature off-chain autorise de la valeur (permit, intents/solver, retraits exchange).

**C2 — `eth_signTypedData_v4` : approuvé mais signé par personne en local. [CONFIRMÉ] — H2 ⬆ Critique.**
Gaté pour approbation (`sw-wiring.ts:286-290`) mais aucun case dans `EvmProvider.request` → tombe en `default` → **proxifié au nœud RPC** (`evm-provider.ts:63-64`) qui n'a pas la clé. Aucune implémentation EIP-712 dans le repo. L'utilisateur approuve une signature de données structurées **sans affichage domaine/struct** (blind-sign total), et l'intent part au backend. Surface permit/trade/intent = mésorientation de fonds.

**C3 — Reçu synthétique : succès `status:0x1` forgé pour un tx non résolu/échoué. [CONFIRMÉ] — M1 ⬆ Critique.**
`build-synthetic-receipt.ts` renvoie `status:'0x1'`, `logs:[]`, `gasUsed:0x5208`, `blockHash=txHash` dès que le tx réel est introuvable dans la fenêtre du resolver (15×2s = **30s**, `resolve-synthetic-hash.ts:16`). Tout op cross-runtime qui **revert** côté EVM, ou simplement non miné/indexé en 30s, donne un **reçu de succès forgé sans logs**. Un marchand/dApp/back-end qui poll `eth_getTransactionReceipt` et crédite sur `status==0x1` livre des biens / crédite un solde pour un transfert jamais arrivé. **Primitive de fraude marchande / perte de fonds**, pas un fallback cosmétique. → Ne jamais synthétiser un succès : renvoyer `null` (pending) jusqu'à reçu réel.

### HAUT

**H-A — Liaison hash synthétique→tx réel par (`from` OU `to` == alias), sans corrélation nonce/value/calldata. [CONFIRMÉ] — M3 ⬆ Haut.**
`resolve-synthetic-hash.ts:78-86` matche le **premier tx non réclamé** où `from` ou `to` == alias. Ops concurrents (ou deux ops to/from le même alias) → le reçu N se lie à l'op M. `claimedHashes` est en mémoire par-provider (pas de dedup cross-restart/cross-tab). L'utilisateur/dApp voit le **mauvais hash/reçu** (montant/destinataire différents). Combiné à C3, un op *échoué* peut hériter du reçu d'un op *réussi* différent. → Corréler sur sender + nonce/value/calldata ; persister.

**H-B — Troncature wei↔mutez : perte de fonds silencieuse, succès quand même rapporté. [CONFIRMÉ] — H4 ⬆ Haut.**
`BigInt(amount) / 10n**12n` (floor) sur le chemin sortant (`send-transfer.ts:38,74` ; `build-tezos-to-evm-call.ts:100`). Tout montant wei avec reste < 1e12 (= 1 mutez) est **floored** ; le reste est de la valeur réelle perdue. L'op renvoie un hash → « succès ». Aucune vérification de reste, aucun rejet, aucune divulgation d'arrondi. Les conversions UI utilisent le même floor → l'affichage **cache** aussi la troncature. Round-trip wei→mutez→wei non idempotent (réconciliation comptable cassée). → Rejeter (ou arrondir avec consentement) tout wei non divisible par 1e12 ; ne pas rapporter succès sur transfert tronqué.

**H-C — Blind-signing des appels NAC cross-runtime ; l'utilisateur ne voit jamais ce qui s'exécute. [CONFIRMÉ]**
Pour un send cross-runtime source-Tezos, ce qui est signé = un op Michelson `call_evm` vers le `NAC_CONTRACT` hardcodé (`tezos-signer.ts:152-188`) avec `mutezAmount` + un `michelineArg` opaque. L'approbation `TxView` n'affiche que le `to`/`value`/`data` **EVM** (tronqué) et `methodSig ?? 'Contract call'` — et `methodSig` n'est **jamais peuplé** sur le chemin tx-dApp (`sw-wiring.ts:311-321`). Donc : l'utilisateur approuve « EVM vers 0xabc… » mais signe un appel gateway Michelson dont la destination KT1 n'est jamais montrée ; `value` montré en wei alors que le montant signé est `wei/1e12` mutez ; `data` tronqué. Blind-signing complet sur la classe d'opérations la plus à valeur. → Afficher destination résolue, entrypoint, sélecteur décodé, et **montant mutez effectif** dérivés des octets exacts signés.

**H-D — Résolution de sélecteur via 4byte.directory distant → pilote l'entrypoint/encodage Michelson → mésorientation. [CONFIRMÉ chemin, INFÉRÉ effet kernel]**
`build-tezos-to-evm-call.ts:37-60` : les sélecteurs 4-octets inconnus sont résolus par un **appel HTTPS non authentifié à `4byte.directory`** (base communautaire, collisions/garbage connus), prenant `results[0].text_signature`, embarqué verbatim dans le Micheline `call_evm` signé. Un mapping faux/malveillant change l'interprétation de l'arg → mauvais entrypoint/décodage côté destination → valeur ou appel mésorienté. En échec de lookup, fallback sur le **hex brut du sélecteur** (call malformé). Pas d'allowlist au-delà des 14 `KNOWN_SIGNATURES`, pas de pinning, dépendance réseau = footgun de liveness. + **fuite de privacy** : les sélecteurs de chaque appel de l'utilisateur partent à un tiers. → Supprimer le fallback distant pour tout ce qui affecte les octets signés ; registre ABI local audité ; rejeter les sélecteurs inconnus.

### MOYEN

**M-A — Adresses gateway/precompile hardcodées et faites-confiance, sans vérification on-chain. [CONFIRMÉ]** `NAC_CONTRACT=KT18oDJJ…`, `NAC_PRECOMPILE=0xff…0007` (previewnet). Shippées telles quelles, toute la valeur cross-runtime y est routée sans vérif du code-hash. Stale/faux au déploiement = fonds vers KT1 mort/attaquant. L'alias (`tez_getTezosEthereumAddress`) est aussi pleinement fait-confiance. → Config par réseau, vérif au démarrage, valider le round-trip d'alias.

**M-B — Frais forcés / gas dApp ignoré ; pas de plafond sur le fee de retry. [CONFIRMÉ]** EVM : `maxPriorityFeePerGas=0`, `maxFeePerGas=gasPrice×2`, gas 2M, **overrides dApp ignorés** (`evm-provider.ts:95,105`) → priority 0 = risque jamais-miné (intent bloqué). Tezos : sur rejet, resubmit avec `extractRequiredFee(err)` **regex-scrapé de l'erreur RPC** (`<1 ⇒ ×1e6`), **sans plafond ni re-confirmation** → un RPC malveillant/buggé peut faire payer un fee arbitrairement grand. → Plafonner le fee de retry, re-confirmer toute hausse.

**M-C — Sourcing de nonce en course / pas de lock par compte. [CONFIRMÉ]** Nonce EVM via `eth_getTransactionCount(addr,'latest')` au send (`evm-provider.ts:86`) sans tracking pending local. Deux sends quasi simultanés (dApp + wallet, ou deux onglets) → même nonce → un tx remplace/évince l'autre (drop silencieux d'un transfert) ou collision. Pas de mutex dans `send-transfer.ts`. → Sérialisation par compte + pending-nonce local.

### BAS / NOTÉ
- **L-A — Clé privée non, mais tx signé brut + params loggés en console** (`evm-provider.ts:109-117` ; `tezos-signer.ts`). Persiste dans les logs SW. À retirer.
- **L-B — `eth_estimateGas` constant `0x1e8480`, `eth_gasPrice`→`0x0`** (relayer) → checks d'affordabilité dApp sans valeur.
- **L-C — Split de version `@noble/curves`** : root v1.9.7 (sans API `format`/`prehash`), nested wallet v2.2.0. Le code de signature n'est correct **que** parce que l'import résout sur v2. Un changement de hoist/dedupe promouvant v1 casserait silencieusement la signature — **sans test pour l'attraper**. → Pinner + KAT.

### Énumération des écarts « affiché ≠ signé » (blind-signing)
1. `personal_sign` — texte UTF-8 affiché ; ASCII de l'hex signé (C1). Pire : divergence contrôlée par l'attaquant.
2. `eth_signTypedData_v4` — popup de signature affiché ; rien signé en local (C2).
3. NAC cross-runtime — `to/value/data` EVM affiché ; op Michelson `call_evm` vers `NAC_CONTRACT` signé (H-C).
4. Montant cross-runtime — `value` wei affiché ; mutez floored effectif (H-B).
5. `methodSig` — jamais peuplé sur le chemin tx-dApp → toujours « Contract call » (H-C).
6. Statut de reçu — `0x1` succès affiché pour ops non résolus/échoués (C3) ; hash possiblement étranger (H-A).

### Primitives de signature CORRECTES (pour distinguer le confirmé-bon du suspect)
Le chemin EIP-1559 (`sign-transaction-1559.ts`) est **correct** : `lowS:true` (anti-malléabilité), `prehash:false`, `yParity` 0/1, `chainId` dans le RLP signé (liaison replay EIP-155/1559), `bigIntToBytes` minimal (pas de leading-zero), access-list RLP correcte. EIP-55 correct. Les défauts ne sont PAS dans l'assemblage 1559 — ils sont dans personal_sign (C1), 712 manquant (C2), et la couche valeur/translation/reçu cross-runtime (C3, H-A..H-D), plus le fee/nonce opérationnel (M-B/M-C). Pas de legacy/2930 ni création de contrat (M5/M6 inchangés).

---

## Findings surface d'attaque extension

### HAUT
**EXT-1 — Pas de gate d'autorisation par-origine ; « se connecter » est cosmétique. [CONFIRMÉ] — F4 ⬆ Haut.**
`handleEthereumRequest` (`sw-wiring.ts:283-342`) gate `eth_sendTransaction`/`personal_sign`/`signTypedData_v4` uniquement sur `keyring.getUnlocked() != null`, puis enqueue inconditionnellement un popup. Le `sessionStore` est **écrit** à la connexion mais **jamais lu comme prédicat d'autorisation** — pas de check que `msg.origin` a une session, pas de scoping compte/méthode par origine. **Attaque** : n'importe quelle page (sans `eth_requestAccounts` préalable) appelle `eth_sendTransaction` et pop immédiatement une fenêtre Approve fonctionnelle contre le compte actif → primitive de drain en un clic sur un wallet déverrouillé. Dans MetaMask, une origine non connectée n'atteint pas la surface de signature. → Exiger une session active pour `msg.origin` ; scoper le compte signataire à la session ; allow-list de méthodes.

**EXT-2 / EXT-3** = C1 / C2 vus côté surface (display≠signed comme primitive de phishing ; typed-data blind-sign + proxy RPC silencieux).

### MOYEN
**EXT-4 — `eth_accounts` / chain / balance divulgués pré-connexion. [CONFIRMÉ] — F3.** `EvmProvider` renvoie `[address]` pour `eth_accounts` ET `eth_requestAccounts` sans gate (`evm-provider.ts:39-41`) ; EIP-1193 exige `[]` avant connexion. Fingerprinting silencieux + harvest d'adresse → phishing ciblé (attaquant connaît adresse + solde + présence du wallet via `isTezosXRelayer`/EIP-6963). Le chemin Tezos est correct (`[]` si pas de session). → `eth_accounts` doit renvoyer `[]` aux origines sans session.

**EXT-5 — Spam de fenêtres d'approbation non borné ; `requestId` contrôlé par la page → overwrite de queue. [CONFIRMÉ]** `requestId` généré dans le MAIN world de la page (`provider.ts:42-44`), clé de la `Map` `ApprovalQueue`. Pas de rate-limit / cap sur `chrome.windows.create`. (A) DoS : boucle `eth_sendTransaction` → fenêtres illimitées + fatigue d'approbation. (B) Overwrite : deux requests même `requestId` → le premier resolver est droppé (promise jamais résolue, fenêtre orpheline). → Cap par origine ; générer le `requestId` autoritatif côté SW ; rejeter les doublons.

### BAS
- **EXT-6 — host_permissions & endpoints = PREVIEWNET, pas mainnet** (`manifest.json:18-20` ; `constants.ts`) + `4byte.directory`. Indicateur not-production-ready (deployment gate).
- **EXT-7 — Defense-in-depth : `handlePopupRequest` ne check pas `sender.id`** (`sw-wiring.ts:72-77` ne le fait que pour GET/RESOLVE_PENDING). Non exploitable aujourd'hui (pas d'`externally_connectable`, type hardcodé) mais retire une couche si jamais ajouté. → Asserter `sender.id === chrome.runtime.id` en tête de `handlePopupRequest`.

### Items évalués SAINS (acceptables production)
- Gestion d'origine : `event.source===window` + origine content-script-dérivée (`bridge.ts:19-27`) → non spoofable.
- Durcissement MV3 : CSP, pas d'`externally_connectable`/`web_accessible_resources` (strippés par `postbuild-manifest.mjs`), Approve refuse le framing.
- **Pas de bait-and-switch sur tx** : le SW exécute le même `msg.args` qu'affiché, compte pinné à l'enqueue (`sw-wiring.ts:336-364`). (Sauf les écarts personal_sign/typed-data ci-dessus.)
- Supply chain : aucun script install (`package-lock.json`), crypto de signature = `@noble`/`@scure` (audités, zéro-dep), `viem` PAS sur le chemin de signature wallet. ⚠ versions caret-floating → pinner + integrity pour un build de custody.

---

## Synthèse — sévérités à relever pour la production

| Prior | Nouveau | Raison |
|---|---|---|
| H1 (personal_sign) | **Critique** (C1) | affiché≠signé contrôlé par l'attaquant, pas juste sigs fausses |
| H2 (typed data) | **Critique** (C2) | signature approuvée mais non vérifiable / proxy RPC |
| M1 (reçu synthétique) | **Critique** (C3) | reçus de succès forgés = fraude marchande / perte à l'échelle |
| M3 (résolution hash) | **Haut** (H-A) | mauvais reçu lié, se cumule avec C3 |
| H4 (troncature valeur) | **Haut** (H-B) | perte silencieuse rapportée comme succès, + cachée à l'affichage |
| F4 (pas de gate origine) | **Haut** (EXT-1) | « connect » décoratif → surface de signature ouverte à toute origine |
| F3 (disclosure adresse) | **Moyen** (EXT-4) | ciblage/privacy soutenu |

## Barre minimale avant mainnet (consolidée)
**Gestion de clés** : auto-lock ; KDF Argon2id/≥600k ; ne plus cacher le mdp brut ; throttle unlock ; support HW wallet (ou posture assumée) ; politique mdp ≥12 ; audit UI export ; corriger le piège recovery EVM.
**Signing/valeur** : fixer EIP-191 (décoder l'hex + afficher exactement les octets signés) ; implémenter ou hard-rejeter EIP-712 avec affichage structuré ; ne jamais forger un reçu de succès ; corréler hash synthétique→réel + persister ; rejeter les wei non divisibles par 1e12 ; afficher la vraie cible/entrypoint/montant des appels NAC ; supprimer le fallback 4byte.directory ; plafonner les fees de retry ; sérialiser les nonces.
**Surface extension** : faire des sessions un gate par-origine/compte/méthode appliqué ; gater `eth_accounts` ; cap d'approbations + requestId côté SW ; retirer les logs de secrets ; repointer mainnet ; pinner les deps.
**Tests/CI** (cf. TEST-AUDIT) : zéro test sur toute primitive de signature, signer, fee math, et tout le relayer ; aucun KAT crypto ; CI ne lance pas les tests. **Disqualifiant pour de la custody mainnet en l'état.**

---

## Fichiers clés
`packages/wallet/src/background/keyring.ts`, `.../shared/seed.ts`, `.../shared/evm-signing/{sign-personal-message,sign-transaction-1559,rlp,derive-evm-account}.ts`, `.../adapters/evm/{evm-provider,evm-signer}.ts`, `.../adapters/tezos/tezos-signer.ts`, `.../composition/sw-wiring.ts`, `.../background/approval-queue.ts`, `.../content/bridge.ts`, `.../injected/provider.ts`, `.../ui/pages/Approve/{TxView,SignatureView}.tsx`, `.../adapters/chrome/{chrome-vault-store,chrome-session-store}.ts`, `packages/wallet/manifest.json`, `packages/relayer/src/tezos/provider.ts`, `packages/relayer/src/use-cases/{build-tezos-to-evm-call,build-evm-to-tezos-call,build-synthetic-receipt,resolve-synthetic-hash}.ts`, `packages/relayer/src/shared/{abi,constants}.ts`.
