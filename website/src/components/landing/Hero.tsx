import Link from '@docusaurus/Link';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import relayerPkg from '../../../../packages/relayer/package.json';
import walletPkg from '../../../../packages/wallet/package.json';

const RELAYER_VERSION = relayerPkg.version;
const WALLET_VERSION  = walletPkg.version;

const HYPERSPEED_OPTIONS = {
  distortion: 'turbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 3,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5] as [number, number],
  lightStickHeight: [1.3, 1.7] as [number, number],
  movingAwaySpeed: [20, 35] as [number, number],
  movingCloserSpeed: [-40, -70] as [number, number],
  carLightsLength: [12, 80] as [number, number],
  carLightsRadius: [0.05, 0.14] as [number, number],
  carWidthPercentage: [0.3, 0.5] as [number, number],
  carShiftX: [-0.8, 0.8] as [number, number],
  carFloorSeparation: [0, 5] as [number, number],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0x131318,
    brokenLines: 0x131318,
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0x03b3c3,
  },
} as const;

function HyperspeedBackground() {
  return (
    <BrowserOnly>
      {() => {
        const Hyperspeed = require('../Hyperspeed').default;
        return <Hyperspeed effectOptions={HYPERSPEED_OPTIONS} />;
      }}
    </BrowserOnly>
  );
}

export function Hero() {
  return (
    <header className="relative min-h-[calc(100dvh-60px)] flex flex-col items-center justify-center overflow-hidden px-4 py-20 sm:px-6 lg:px-8" style={{ background: '#000' }}>
      {/* Hyperspeed WebGL background */}
      <div className="absolute inset-0 z-0 opacity-60">
        <HyperspeedBackground />
      </div>
      {/* Gradient overlay for readability */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl text-center" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex flex-wrap justify-center gap-2"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(108,71,255,0.25)] bg-[rgba(108,71,255,0.08)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#a890ff] backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7c5cff] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7c5cff]" />
            </span>
            Relayer v{RELAYER_VERSION}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,194,255,0.25)] bg-[rgba(0,194,255,0.08)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#7dd3fc] backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00c2ff] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00c2ff]" />
            </span>
            Wallet v{WALLET_VERSION}
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.05]"
        >
          <span
            className="inline-block bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(135deg, #6c47ff 0%, #00c2ff 40%, #a855f7 70%, #6c47ff 100%)',
              backgroundSize: '200% auto',
              animation: 'shimmer 4s linear infinite',
            }}
          >
            TezosX
          </span>
        </motion.h1>

        {/* Glow under title */}
        <div
          className="pointer-events-none mx-auto -mt-8 h-16 w-3/5"
          style={{
            background: 'radial-gradient(ellipse, rgba(108,71,255,0.3) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-4 max-w-xl text-base sm:text-lg leading-relaxed"
          style={{ color: 'var(--ifm-color-emphasis-700)' }}
        >
          Relayer & Wallet for <strong>Tezos X / Etherlink</strong>.
          <br />
          Use any Etherlink dApp with just a{' '}
          <code className="rounded-md bg-[rgba(108,71,255,0.1)] px-1.5 py-0.5 font-mono text-sm text-[#a890ff]">
            tz1
          </code>{' '}
          — no EVM account required.
        </motion.p>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-10 flex flex-wrap justify-center gap-4"
        >
          <Link
            to="/docs/intro"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6c47ff] to-[#7c3aed] px-6 py-3 text-sm font-bold text-white shadow-[0_4px_24px_rgba(108,71,255,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(108,71,255,0.45)] no-underline hover:no-underline"
          >
            Relayer docs
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/wallet/intro"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#00c2ff] px-6 py-3 text-sm font-bold text-white shadow-[0_4px_24px_rgba(0,194,255,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,194,255,0.4)] no-underline hover:no-underline"
          >
            Wallet docs
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="https://github.com/trilitech/tezos-x-wallet"
            className="inline-flex items-center rounded-xl px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 no-underline hover:no-underline"
            style={{ color: 'var(--ifm-color-emphasis-600)' }}
          >
            GitLab&nbsp;→
          </Link>
        </motion.div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-40 z-10">
        <div className="flex h-9 w-6 items-start justify-center rounded-full border-2 border-current pt-2" style={{ color: 'var(--ifm-color-emphasis-500)' }}>
          <div className="h-2 w-0.5 animate-bounce rounded-full bg-current" />
        </div>
      </div>

      {/* Smooth fade from hero black into the page background */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[2] h-40 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, #000 100%)',
        }}
      />
    </header>
  );
}
