import Link from '@docusaurus/Link';
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Zap, Radio, Hexagon, KeyRound, Package, TestTube, ArrowRight, type LucideIcon } from 'lucide-react';
import { TiltCard } from './TiltCard';

const PRODUCTS = [
  {
    accent: '#6c47ff',
    badge: 'Relayer',
    title: 'TezosX Relayer',
    desc: 'An injectable EIP-1193 provider that bridges Ethereum dApps to Tezos X. Delegates signing to Temple Wallet via the Beacon protocol.',
    bullets: [
      'Injects window.ethereum on every page',
      'Converts EVM calls to Tezos L1 operations',
      'Works with wagmi, RainbowKit, ethers.js',
    ],
    cta: { label: 'Relayer docs', to: '/docs/intro' },
  },
  {
    accent: '#00c2ff',
    badge: 'Wallet',
    title: 'TezosX Wallet',
    desc: 'A standalone Chrome extension wallet. Holds your Tezos keypair locally and signs transactions itself — no Temple required.',
    bullets: [
      'BIP-39 seed phrase, AES-256-GCM encrypted',
      'Self-custodied — no external wallet needed',
      'dApp approval popups with full EIP-1193',
    ],
    cta: { label: 'Wallet docs', to: '/wallet/intro' },
  },
];

const FEATURES = [
  { Icon: Zap,     title: 'EIP-1193 Provider',  desc: 'Full window.ethereum implementation, dApps see a standard Ethereum provider.',                    accent: '#6c47ff' },
  { Icon: Radio,   title: 'EIP-6963 Discovery',  desc: 'Multi-wallet discovery protocol. Works with RainbowKit, wagmi, and modern dApp stacks.',          accent: '#00c2ff' },
  { Icon: Hexagon, title: 'NAC Gateway',          desc: 'Transactions routed atomically through the TezosX gateway, tz1 becomes your EVM identity.',       accent: '#7c3aed' },
  { Icon: KeyRound,title: 'Local Signing',        desc: 'The wallet signs L1 operations locally via Taquito InMemorySigner — zero Temple dependency.',     accent: '#a855f7' },
  { Icon: Package, title: 'Chrome Extension',     desc: 'Two MV3 extensions for Chrome, Brave, and Firefox — Relayer and Wallet, both auto-injecting.',    accent: '#06b6d4' },
  { Icon: TestTube,title: 'Testnet Ready',        desc: 'Built and tested on Tezos X testnet. Counter, faucet, and DEX interactions validated.',           accent: '#10b981' },
];

function FeatureCard({
  Icon,
  title,
  desc,
  accent,
  index,
}: {
  Icon: LucideIcon;
  title: string;
  desc: string;
  accent: string;
  index: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 36, rotateX: 10 }}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, type: 'spring', stiffness: 110 }}
    >
      <TiltCard
        className="group relative overflow-hidden rounded-2xl border border-[rgba(108,71,255,0.1)] hover:border-[rgba(108,71,255,0.4)] hover:shadow-[0_12px_48px_rgba(108,71,255,0.18)]"
        style={{ background: 'rgba(15,15,25,0.85)' }}
      >
        {/* Mouse-follow glow */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              `radial-gradient(400px circle at var(--mx, 50%) var(--my, 50%), ${accent}15, transparent 60%)`,
          }}
        />
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
        {/* Bottom glow */}
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-24 w-3/4 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(ellipse, ${accent}12 0%, transparent 70%)`,
            filter: 'blur(20px)',
          }}
        />
        {/* Content */}
        <div className="relative z-10 p-6 sm:p-8">
          <div
            className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-lg transition-transform duration-300 group-hover:scale-110"
            style={{ background: `${accent}18`, color: accent, boxShadow: `0 0 0 0 ${accent}00`, transition: 'transform 0.3s, box-shadow 0.3s' }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="mb-2 text-base font-bold" style={{ color: 'var(--ifm-heading-color)' }}>
            {title}
          </h3>
          <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--ifm-color-emphasis-600)' }}>
            {desc}
          </p>
        </div>
      </TiltCard>
    </motion.div>
  );
}

function ProductCard({
  accent,
  badge,
  title,
  desc,
  bullets,
  cta,
  index,
}: (typeof PRODUCTS)[number] & { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: index * 0.12, type: 'spring', stiffness: 100 }}
      className="flex"
    >
      <TiltCard
        className="group relative flex w-full flex-col overflow-hidden rounded-2xl border hover:shadow-[0_16px_56px_rgba(0,0,0,0.25)]"
        style={{
          background: 'rgba(15,15,25,0.90)',
          borderColor: `${accent}22`,
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
        {/* Mouse-follow glow */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: `radial-gradient(420px circle at var(--mx,50%) var(--my,50%), ${accent}12, transparent 60%)` }}
        />
        <div className="relative z-10 flex flex-1 flex-col p-7 sm:p-8">
          {/* Badge */}
          <span
            className="mb-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest"
            style={{ background: `${accent}18`, color: accent }}
          >
            {badge}
          </span>
          {/* Title */}
          <h3 className="mb-3 text-xl font-extrabold tracking-tight" style={{ color: 'var(--ifm-heading-color)' }}>
            {title}
          </h3>
          {/* Description */}
          <p className="mb-5 text-sm leading-relaxed" style={{ color: 'var(--ifm-color-emphasis-600)' }}>
            {desc}
          </p>
          {/* Bullets */}
          <ul className="mb-7 flex flex-col gap-2 m-0 list-none p-0">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ifm-color-emphasis-700)' }}>
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                {b}
              </li>
            ))}
          </ul>
          {/* CTA */}
          <div className="mt-auto">
            <Link
              to={cta.to}
              className="group/btn inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 no-underline hover:no-underline"
              style={{
                background: `linear-gradient(135deg, ${accent}cc, ${accent})`,
                boxShadow: `0 4px 20px ${accent}33`,
              }}
            >
              {cta.label}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

export function Features() {
  return (
    <section className="mt-16 mb-20">
      {/* Products */}
      <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#7c5cff]">Products</span>
      <h2 className="mb-8 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--ifm-heading-color)' }}>
        Two ways to connect Tezos to Etherlink dApps.
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">
        {PRODUCTS.map((p, i) => (
          <ProductCard key={p.title} {...p} index={i} />
        ))}
      </div>

      {/* Shared capabilities */}
      <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#7c5cff]">Capabilities</span>
      <h2 className="mb-10 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--ifm-heading-color)' }}>
        Everything a dApp expects. Powered by Tezos.
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} {...f} index={i} />
        ))}
      </div>
    </section>
  );
}
