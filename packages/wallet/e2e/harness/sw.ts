import type { Worker } from '@playwright/test';

export async function sendSwMessage<T>(sw: Worker, message: unknown): Promise<T> {
  return sw.evaluate(async (msg) => {
    return (await chrome.runtime.sendMessage(msg)) as unknown;
  }, message) as Promise<T>;
}

export async function readChromeStorage<T = unknown>(sw: Worker, key: string): Promise<T | undefined> {
  return sw.evaluate(async (k) => {
    const data = await chrome.storage.local.get(k);
    return data[k] as unknown;
  }, key) as Promise<T | undefined>;
}
