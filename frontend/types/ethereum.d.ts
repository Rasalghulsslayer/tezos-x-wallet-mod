interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
  isTezosXRelayer?: boolean;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export {};
