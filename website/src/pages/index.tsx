import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';
import pkg from '../../../package.json';

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroBadge}>v{pkg.version} · Testnet · Shadownet</div>
        <h1 className={styles.heroTitle}>Tezos X Relayer</h1>
        <p className={styles.heroSubtitle}>
          Interact with <strong>Etherlink dApps</strong> using your Tezos wallet.
          <br />
          No EVM account required — just Temple and a tz1 address.
        </p>
        <div className={styles.heroButtons}>
          <Link className={styles.btnPrimary} to="/docs/intro">
            Get Started
          </Link>
          <Link className={styles.btnSecondary} to="/docs/architecture/overview">
            Architecture
          </Link>
          <Link
            className={styles.btnGhost}
            href="https://gitlab.com/tezos-infra/techrel/support-xdev-qa/tezosx-relayer"
          >
            GitLab →
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    icon: '⚡',
    title: 'EIP-1193 Provider',
    description: 'Full window.ethereum implementation — dApps see a standard Ethereum provider with no code changes required.',
    accent: 'linear-gradient(90deg, #6c47ff, #9b6dff)',
    iconBg: 'rgba(108, 71, 255, 0.15)',
  },
  {
    icon: '◎',
    title: 'EIP-6963 Discovery',
    description: 'Announces itself via multi-wallet discovery. Compatible with RainbowKit, wagmi, and modern dApp stacks.',
    accent: 'linear-gradient(90deg, #00c2ff, #0080ff)',
    iconBg: 'rgba(0, 194, 255, 0.12)',
  },
  {
    icon: '⬡',
    title: 'CRAC Gateway',
    description: 'Transactions are routed atomically through the Tezos X gateway — your tz1 address becomes your EVM identity.',
    accent: 'linear-gradient(90deg, #7c3aed, #6c47ff)',
    iconBg: 'rgba(124, 58, 237, 0.15)',
  },
  {
    icon: '◈',
    title: 'Temple Wallet',
    description: 'Connect via Temple browser extension or mobile app using the Beacon protocol.',
    accent: 'linear-gradient(90deg, #00c2ff, #6c47ff)',
    iconBg: 'rgba(0, 194, 255, 0.12)',
  },
  {
    icon: '∴',
    title: 'No Install Required',
    description: 'Inject via a script tag, Tampermonkey userscript, or Chrome extension — works on any dApp.',
    accent: 'linear-gradient(90deg, #a855f7, #6c47ff)',
    iconBg: 'rgba(168, 85, 247, 0.12)',
  },
  {
    icon: '⬢',
    title: 'Testnet Ready',
    description: 'Built and tested on Etherlink shadownet. Counter contract, faucet, and DEX interactions validated.',
    accent: 'linear-gradient(90deg, #06b6d4, #00c2ff)',
    iconBg: 'rgba(6, 182, 212, 0.12)',
  },
];

function FeatureCard({icon, title, description, accent, iconBg}: typeof features[0]) {
  return (
    <div
      className={styles.card}
      style={{ '--card-accent': accent, '--card-icon-bg': iconBg } as React.CSSProperties}
    >
      <div className={styles.cardIconWrap}>{icon}</div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDesc}>{description}</p>
    </div>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <Hero />
      <main className={styles.main}>
        <section className={styles.features}>
          <div className={styles.featuresHeader}>
            <div className={styles.sectionLabel}>What it does</div>
            <h2 className={styles.featuresTitle}>Everything a dApp expects. Powered by Tezos.</h2>
          </div>
          <div className={styles.grid}>
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

        <section className={styles.codeSection}>
          <div className={styles.featuresHeader}>
            <div className={styles.sectionLabel}>Quick start</div>
            <h2 className={styles.featuresTitle}>Up and running in 3 steps.</h2>
          </div>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepMeta}>
                <span className={styles.stepNumber}>01</span>
                <div className={styles.stepInfo}>
                  <span className={styles.stepTitle}>Inject the relayer</span>
                  <span className={styles.stepDesc}>Add the script before any dApp code loads</span>
                </div>
              </div>
              <pre className={styles.codeBlock}>{`<script src="/dist/relayer.iife.js"></script>`}</pre>
            </div>
            <div className={styles.stepDivider} />
            <div className={styles.step}>
              <div className={styles.stepMeta}>
                <span className={styles.stepNumber}>02</span>
                <div className={styles.stepInfo}>
                  <span className={styles.stepTitle}>Connect Temple wallet</span>
                  <span className={styles.stepDesc}>Opens Beacon — returns your EVM alias</span>
                </div>
              </div>
              <pre className={styles.codeBlock}>{`const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
// → ['0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2']`}</pre>
            </div>
            <div className={styles.stepDivider} />
            <div className={styles.step}>
              <div className={styles.stepMeta}>
                <span className={styles.stepNumber}>03</span>
                <div className={styles.stepInfo}>
                  <span className={styles.stepTitle}>Send a transaction</span>
                  <span className={styles.stepDesc}>Routed through CRAC gateway — signed by Temple</span>
                </div>
              </div>
              <pre className={styles.codeBlock}>{`await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{ to: '0x...', value: '0xde0b6b3a7640000' }]
});`}</pre>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
