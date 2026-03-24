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

function FeatureCard({icon, title, description}: {icon: string; title: string; description: string}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardIcon}>{icon}</div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDesc}>{description}</p>
    </div>
  );
}

const features = [
  {
    icon: '🔌',
    title: 'EIP-1193 Provider',
    description: 'Full window.ethereum implementation — dApps see a standard Ethereum provider with no code changes required.',
  },
  {
    icon: '🔍',
    title: 'EIP-6963 Discovery',
    description: 'Announces itself via multi-wallet discovery. Compatible with RainbowKit, wagmi, and modern dApp stacks.',
  },
  {
    icon: '🌉',
    title: 'CRAC Gateway',
    description: 'Transactions are routed atomically through the Tezos X gateway — your tz1 address becomes your EVM identity.',
  },
  {
    icon: '📱',
    title: 'Temple Wallet',
    description: 'Connect via Temple browser extension or mobile app using the Beacon protocol.',
  },
  {
    icon: '💉',
    title: 'No Install Required',
    description: 'Inject via a script tag, Tampermonkey userscript, or Chrome extension — works on any dApp.',
  },
  {
    icon: '🧪',
    title: 'Testnet Ready',
    description: 'Built and tested on Etherlink shadownet. Counter contract, faucet, and DEX interactions validated.',
  },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <Hero />
      <main className={styles.main}>
        <section className={styles.features}>
          <div className={styles.sectionLabel}>What it does</div>
          <div className={styles.grid}>
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

        <section className={styles.codeSection}>
          <div className={styles.sectionLabel}>Quick start</div>
          <pre className={styles.codeBlock}>{`// 1. Inject the relayer (script tag or Tampermonkey)
<script src="/dist/relayer.iife.js"></script>

// 2. Connect Temple wallet
const accounts = await window.ethereum.request({
  method: 'eth_requestAccounts'
});
// → ['0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2']

// 3. Send a transaction
await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{ to: '0x...', value: '0xde0b6b3a7640000' }]
});`}</pre>
        </section>
      </main>
    </Layout>
  );
}
