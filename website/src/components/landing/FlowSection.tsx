import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const FLOW = [
  { icon: '◈', label: 'Temple', sub: 'Beacon · tz1' },
  { icon: '⚡', label: 'Relayer', sub: 'EIP-1193' },
  { icon: '⬡', label: 'CRAC', sub: 'Gateway' },
  { icon: '⬢', label: 'Etherlink', sub: 'EVM dApps' },
];

export function FlowSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <section ref={ref} className="mb-20">
      <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#7c5cff]">How it works</span>
      <h2 className="mb-10 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--ifm-heading-color)' }}>
        From tz1 to EVM in one flow
      </h2>

      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-center justify-center gap-0">
        {FLOW.map((node, i) => (
          <div key={node.label} className="flex items-center">
            {i > 0 && (
              <div className="relative mx-2 h-[2px] w-16 overflow-hidden rounded-full bg-[rgba(108,71,255,0.15)]">
                <motion.div
                  className="absolute h-full w-2/5 rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, #7c5cff, #00c2ff, transparent)', boxShadow: '0 0 8px rgba(108,71,255,0.5)' }}
                  animate={{ left: ['-40%', '110%'] }}
                  transition={{ duration: 2, delay: i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="flex min-w-[120px] flex-col items-center gap-1.5 rounded-2xl border border-[rgba(108,71,255,0.12)] p-5 transition-all hover:-translate-y-1 hover:border-[rgba(108,71,255,0.35)] hover:shadow-[0_4px_24px_rgba(108,71,255,0.12)]"
              style={{ background: 'rgba(15,15,25,0.8)' }}
            >
              <span className="text-2xl">{node.icon}</span>
              <span className="text-sm font-bold" style={{ color: 'var(--ifm-heading-color)' }}>{node.label}</span>
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--ifm-color-emphasis-500)' }}>
                {node.sub}
              </span>
            </motion.div>
          </div>
        ))}
      </div>

      {/* Mobile: vertical */}
      <div className="flex sm:hidden flex-col items-center gap-0">
        {FLOW.map((node, i) => (
          <div key={node.label} className="flex flex-col items-center">
            {i > 0 && (
              <div className="relative my-1 h-8 w-[2px] overflow-hidden rounded-full bg-[rgba(108,71,255,0.15)]">
                <motion.div
                  className="absolute w-full rounded-full"
                  style={{ height: '40%', background: 'linear-gradient(180deg, transparent, #7c5cff, transparent)', boxShadow: '0 0 8px rgba(108,71,255,0.5)' }}
                  animate={{ top: ['-40%', '110%'] }}
                  transition={{ duration: 2, delay: i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="flex w-full max-w-[200px] flex-col items-center gap-1.5 rounded-2xl border border-[rgba(108,71,255,0.12)] p-4 transition-all"
              style={{ background: 'rgba(15,15,25,0.8)' }}
            >
              <span className="text-xl">{node.icon}</span>
              <span className="text-sm font-bold" style={{ color: 'var(--ifm-heading-color)' }}>{node.label}</span>
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--ifm-color-emphasis-500)' }}>
                {node.sub}
              </span>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}
