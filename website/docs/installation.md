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
git clone https://github.com/Antonybyrt/Tezosx-relayer.git
cd Tezosx-relayer
npm install
```

## Build

```bash
node build.mjs
# → dist/relayer.iife.js
```

## Dev server

Serve the bundle with CORS enabled (required for Tampermonkey injection):

```bash
npx serve . -p 8080 --cors
```

The relayer will be available at `http://localhost:8080/dist/relayer.iife.js`.
