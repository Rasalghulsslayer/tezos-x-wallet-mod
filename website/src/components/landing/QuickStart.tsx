import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

const TABS = [
  {
    id: 'relayer',
    label: 'Relayer',
    accent: '#6c47ff',
    terminalLabel: 'relayer-quickstart',
    steps: [
      {
        n: '01',
        t: 'Build & install the extension',
        s: 'Build from the repo root, then load unpacked in Chrome',
        code: 'npm install && npm run build:ext\n# Load packages/relayer/extension/ as unpacked\n# extension in chrome://extensions',
      },
      {
        n: '02',
        t: 'Connect Temple wallet',
        s: 'Opens Beacon — returns your EVM alias derived from tz1',
        code: `const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
// → ['0x341af4…7cb2']`,
      },
      {
        n: '03',
        t: 'Send a transaction',
        s: 'Routed through NAC gateway — signed by Temple',
        code: `await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{ to: '0x…', value: '0xde0b6b3a7640000' }]
});`,
      },
    ],
  },
  {
    id: 'wallet',
    label: 'Wallet',
    accent: '#00c2ff',
    terminalLabel: 'wallet-quickstart',
    steps: [
      {
        n: '01',
        t: 'Build & install the wallet',
        s: 'Build from the repo root, then load the unpacked extension',
        code: 'npm install && npm run wallet:build\n# Load packages/wallet/dist/ as unpacked\n# extension in chrome://extensions',
      },
      {
        n: '02',
        t: 'Connect from a dApp',
        s: 'Create or import a wallet from the toolbar popup first — then dApps connect as usual',
        code: `// window.ethereum is injected automatically.
// dApps call eth_requestAccounts as usual:
const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
// Wallet approval popup opens → user approves
// → ['0x341af4…7cb2']`,
      },
      {
        n: '03',
        t: 'Sign transactions locally',
        s: 'No Temple — key stays in the extension service worker',
        code: `const txHash = await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{ to: '0x…', value: '0xde0b6b3a7640000' }]
});
// Approval popup opens → user approves → signed locally`,
      },
    ],
  },
] as const;

function Terminal({ tab }: { tab: (typeof TABS)[number] }) {
  const { accent, terminalLabel, steps } = tab;
  const borderColor = `${accent}20`;
  const dividerColor = `${accent}08`;
  const badgeBg = `${accent}10`;
  const badgeBorder = `${accent}25`;

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-[0_8px_40px_rgba(0,0,0,0.2)]"
      style={{ borderColor, background: 'rgba(10,10,18,0.7)', backdropFilter: 'blur(16px)' }}
    >
      {/* Terminal bar */}
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ background: 'rgba(19,19,26,0.8)', borderColor: dividerColor }}
      >
        <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
        <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
        <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
        <span className="ml-auto font-mono text-[0.65rem] font-medium" style={{ color: 'var(--ifm-color-emphasis-400)' }}>
          {terminalLabel}
        </span>
      </div>
      {/* Steps */}
      <div className="divide-y" style={{ borderColor: dividerColor }}>
        {steps.map((step) => (
          <div key={step.n} className="p-5 sm:p-6">
            <div className="mb-3 flex items-start gap-3">
              <span
                className="shrink-0 rounded-md border px-2.5 py-1 font-mono text-[0.65rem] font-bold tracking-wider"
                style={{ background: badgeBg, borderColor: badgeBorder, color: accent }}
              >
                {step.n}
              </span>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--ifm-heading-color)' }}>{step.t}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ifm-color-emphasis-500)' }}>{step.s}</div>
              </div>
            </div>
            <pre
              className="m-0 overflow-x-auto whitespace-pre rounded-xl border p-4 font-mono text-[0.8rem] leading-relaxed text-[#c9d1d9]"
              style={{ borderColor: `${accent}12`, background: 'rgba(0,0,0,0.3)' }}
            >
              <code>{step.code}</code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuickStart() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [active, setActive] = useState<'relayer' | 'wallet'>('relayer');
  const tab = TABS.find((t) => t.id === active)!;

  return (
    <section ref={ref} className="mb-16">
      <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#7c5cff]">Quick start</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight m-0" style={{ color: 'var(--ifm-heading-color)' }}>
          Up and running in 3 steps
        </h2>
        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl border border-[rgba(108,71,255,0.15)] bg-[rgba(15,15,25,0.7)] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className="rounded-lg px-4 py-1.5 text-xs font-bold transition-all border-0 cursor-pointer"
              style={
                active === t.id
                  ? { background: t.accent, color: '#fff', boxShadow: `0 2px 12px ${t.accent}44` }
                  : { background: 'transparent', color: 'var(--ifm-color-emphasis-500)' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        key={active}
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <Terminal tab={tab} />
      </motion.div>
    </section>
  );
}
