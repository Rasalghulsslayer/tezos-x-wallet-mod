declare global {
  interface EIP1193Provider {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    removeListener(event: string, handler: (...args: unknown[]) => void): void;
    isTezosXRelayer?: boolean;
    isMetaMask?:      boolean;
  }

  interface Eip6963ProviderInfo {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  }

  interface Eip6963ProviderDetail {
    info:     Eip6963ProviderInfo;
    provider: EIP1193Provider;
  }

  interface Eip6963AnnounceEvent extends CustomEvent {
    detail: Eip6963ProviderDetail;
  }

  interface Window {
    ethereum?: EIP1193Provider;
  }

  interface WindowEventMap {
    'eip6963:announceProvider': Eip6963AnnounceEvent;
  }
}

export {};
