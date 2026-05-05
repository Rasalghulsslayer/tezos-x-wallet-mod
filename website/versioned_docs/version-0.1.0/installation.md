---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

## Prerequisites

- Node.js 20+
- npm 10+
- [Temple Wallet](https://templewallet.com) (mobile)

## Clone and install

```bash
git clone https://github.com/trilitech/tezos-x-wallet.git
cd Tezosx-relayer
npm install
```

## Build

```bash
node build.mjs
# → dist/relayer.iife.js
```

## Playground

Run the Next.js playground to test the relayer locally:

```bash
cd playground
npm install
npm run dev
# → http://localhost:3000
```

The playground lets you connect Temple, check your balance, send transfers, and interact with the Counter contract.
