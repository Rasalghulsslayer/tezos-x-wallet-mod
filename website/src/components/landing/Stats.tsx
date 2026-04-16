import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { TiltCard } from './TiltCard';

const STATS = [
  { value: '6+', label: 'EIP Standards' },
  { value: '3', label: 'Injection Methods' },
  { value: '<1s', label: 'Relay Time' },
  { value: '0', label: 'dApp Code Changes' },
];

export function Stats() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="-mt-6 relative z-10">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 24, rotateX: 12 }}
            animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 0.6, delay: i * 0.12, type: 'spring', stiffness: 120 }}
          >
            <TiltCard
              className="group flex flex-col items-center gap-2 rounded-2xl border border-[rgba(108,71,255,0.12)] p-6 hover:border-[rgba(108,71,255,0.4)] hover:shadow-[0_8px_40px_rgba(108,71,255,0.15)]"
              style={{ background: 'rgba(15,15,25,0.85)' }}
            >
              {/* Shine overlay */}
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(108,71,255,0.12), transparent 60%)',
                }}
              />
              <span
                className="relative bg-clip-text text-transparent text-3xl sm:text-4xl font-bold"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #6c47ff, #00c2ff)',
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                }}
              >
                {s.value}
              </span>
              <span className="relative text-[0.7rem] font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--ifm-color-emphasis-500)' }}>
                {s.label}
              </span>
            </TiltCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
