import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Unplug,
  Copy,
  Check,
  ExternalLink,
  Wallet,
  Link2,
  ChevronRight,
} from 'lucide-react';
import type { BackgroundRequest, BackgroundResponse, StoredSession } from './messages.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

function chainName(chainId: string): string {
  const dec = parseInt(chainId, 16);
  if (dec === 128064) return 'Tezos X Previewnet';
  if (!isNaN(dec)) return `Chain ${dec}`;
  return chainId || 'Unknown';
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="copy-btn"
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// ── Address row ──────────────────────────────────────────────────────────────

function AddressRow({ label, logo, address }: {
  label:   string;
  logo:    string;
  address: string;
}) {
  return (
    <div className="addr-row">
      <div className="addr-label">
        <img src={logo} alt="" className="addr-logo" />
        {label}
      </div>
      <div className="addr-value">
        <span title={address}>{shortAddr(address)}</span>
        <CopyButton text={address} />
      </div>
    </div>
  );
}

// ── Session card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onDisconnect,
}: {
  session: StoredSession;
  onDisconnect: (origin: string) => void;
}) {
  const hostname = (() => {
    try { return new URL(session.origin).hostname; }
    catch { return session.origin; }
  })();

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-origin">
          <Globe size={14} className="icon-muted" />
          <span className="origin-text" title={session.origin}>{hostname}</span>
        </div>
        <div className="card-meta">
          <span className="chain-pill">{chainName(session.chainId)}</span>
          {session.connectedAt > 0 && (
            <span className="time-ago">{timeAgo(session.connectedAt)}</span>
          )}
        </div>
      </div>

      <div className="card-body">
        <AddressRow label="EVM"   logo="icons/etherlink.png"  address={session.evmAlias} />
        <AddressRow label="Tezos" logo="icons/tezos-logo.png" address={session.tz1Address} />
      </div>

      <div className="card-footer">
        <button
          className="btn-disconnect"
          onClick={() => onDisconnect(session.origin)}
        >
          <Unplug size={13} />
          Disconnect
        </button>
      </div>
    </div>
  );
}

// ── Onboarding ───────────────────────────────────────────────────────────────

function Onboarding({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="onboarding">
      <div className="onboarding-icon">
        <Wallet size={28} />
      </div>
      <h2>Welcome to TezosX</h2>
      <p className="onboarding-sub">Get started in 3 steps</p>

      <div className="steps">
        <Step n={1} text="Install Temple Wallet" />
        <Step n={2} text="Add Tezos X Testnet network" />
        <Step n={3} text="Visit any Tezos X EVM dApp" />
      </div>

      <button className="btn-primary" onClick={onDismiss}>
        Got it
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="step">
      <span className="step-n">{n}</span>
      <span className="step-text">{text}</span>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Link2 size={28} />
      </div>
      <p>No connected sites</p>
      <p className="empty-hint">
        Visit a dApp and connect with <code>eth_requestAccounts</code>
      </p>
    </div>
  );
}

// ── Main app ─────────────────────────────────────────────────────────────────

const ONBOARDING_KEY = 'tezosx_onboarding_done';

function App() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const load = useCallback(() => {
    const req: BackgroundRequest = { type: 'GET_SESSIONS' };
    chrome.runtime.sendMessage(req, (response: BackgroundResponse) => {
      if (chrome.runtime.lastError) {
        setSessions([]);
        setLoading(false);
        return;
      }
      if (response?.type === 'SESSIONS') {
        setSessions(response.sessions);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
    chrome.storage.local.get(ONBOARDING_KEY).then((data) => {
      if (!data[ONBOARDING_KEY]) setShowOnboarding(true);
    });
  }, [load]);

  const disconnect = useCallback((origin: string) => {
    const req: BackgroundRequest = { type: 'DISCONNECT', origin };
    chrome.runtime.sendMessage(req, () => load());
  }, [load]);

  const dismissOnboarding = useCallback(() => {
    void chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    setShowOnboarding(false);
  }, []);

  const version = chrome.runtime.getManifest().version;

  return (
    <div className="app">
      {/* Header */}
      <header>
        <div className="header-left">
          <img src="icons/logo.svg" className="logo" alt="" />
          <div>
            <h1>TezosX Relayer</h1>
            <span className="header-version">v{version}</span>
          </div>
        </div>
        <div className="header-right">
          <span className="testnet-pill">TESTNET</span>
          <span className="count-pill">
            {sessions.length} site{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {/* Content */}
      <main>
        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : showOnboarding && sessions.length === 0 ? (
          <Onboarding onDismiss={dismissOnboarding} />
        ) : sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="session-list">
            {sessions.map((s) => (
              <SessionCard
                key={s.origin}
                session={s}
                onDisconnect={disconnect}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer>
        <span>Tezos X · EIP-1193 Bridge</span>
        <a
          href="https://blockscout.previewnet.tezosx.nomadic-labs.com"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          Previewnet
          <ExternalLink size={10} />
        </a>
      </footer>
    </div>
  );
}

// ── Mount ────────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
