import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const CODE_STEPS = [
  {
    n: '01',
    t: 'Inject the relayer',
    s: 'Add the script before any dApp code loads',
    code: '<script src="/dist/relayer.iife.js"></script>',
  },
  {
    n: '02',
    t: 'Connect Temple wallet',
    s: 'Opens Beacon — returns your EVM alias',
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
];

export function QuickStart() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <section ref={ref} className="mb-16">
      <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#7c5cff]">Quick start</span>
      <h2 className="mb-10 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--ifm-heading-color)' }}>
        Up and running in 3 steps
      </h2>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="overflow-hidden rounded-2xl border border-[rgba(108,71,255,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.2)]"
        style={{ background: 'rgba(10,10,18,0.7)', backdropFilter: 'blur(16px)' }}
      >
        {/* Terminal bar */}
        <div className="flex items-center gap-2 border-b border-[rgba(108,71,255,0.08)] px-4 py-3" style={{ background: 'rgba(19,19,26,0.8)' }}>
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
          <span className="ml-auto font-mono text-[0.65rem] font-medium" style={{ color: 'var(--ifm-color-emphasis-400)' }}>
            relayer-quickstart
          </span>
        </div>

        {/* Steps */}
        <div className="divide-y divide-[rgba(108,71,255,0.06)]">
          {CODE_STEPS.map((step) => (
            <div key={step.n} className="p-5 sm:p-6">
              <div className="mb-3 flex items-start gap-3">
                <span className="shrink-0 rounded-md border border-[rgba(108,71,255,0.2)] bg-[rgba(108,71,255,0.08)] px-2.5 py-1 font-mono text-[0.65rem] font-bold tracking-wider text-[#7c5cff]">
                  {step.n}
                </span>
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--ifm-heading-color)' }}>{step.t}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--ifm-color-emphasis-500)' }}>{step.s}</div>
                </div>
              </div>
              <pre className="m-0 overflow-x-auto whitespace-pre rounded-xl border border-[rgba(108,71,255,0.1)] bg-[rgba(0,0,0,0.3)] p-4 font-mono text-[0.8rem] leading-relaxed text-[#c9d1d9]">
                <code>{step.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
