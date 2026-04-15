import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Zap, Radio, Hexagon, Gem, Package, TestTube, type LucideIcon } from 'lucide-react';
import { TiltCard } from './TiltCard';

const FEATURES = [
  { Icon: Zap, title: 'EIP-1193 Provider', desc: 'Full window.ethereum implementation, dApps see a standard Ethereum provider.', accent: '#6c47ff' },
  { Icon: Radio, title: 'EIP-6963 Discovery', desc: 'Multi-wallet discovery protocol. Works with RainbowKit, wagmi, and modern dApp stacks.', accent: '#00c2ff' },
  { Icon: Hexagon, title: 'CRAC Gateway', desc: 'Transactions routed atomically through the TezosX gateway, tz1 becomes your EVM identity.', accent: '#7c3aed' },
  { Icon: Gem, title: 'Temple Wallet', desc: 'Connect via Temple browser extension or mobile using the Beacon protocol.', accent: '#a855f7' },
  { Icon: Package, title: 'Chrome Extension', desc: 'MV3 extension for Chrome, Brave, and Firefox, injects automatically on every page.', accent: '#06b6d4' },
  { Icon: TestTube, title: 'Testnet Ready', desc: 'Built and tested on Etherlink Shadownet. Counter, faucet, and DEX interactions validated.', accent: '#10b981' },
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

export function Features() {
  return (
    <section className="mt-16 mb-20">
      <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#7c5cff]">Features</span>
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
