import { describe, expect, it } from 'vitest';
import { ContainerCache } from '../container-cache';
import type { Container } from '@tezosx/wallet-core/ports/container';

const stub = (label: string) => ({ __label: label } as unknown as Container);

describe('ContainerCache', () => {
  it('returns undefined on miss and stores on put', () => {
    const cache = new ContainerCache(3);
    expect(cache.get('a')).toBeUndefined();
    cache.put('a', stub('A'));
    expect(cache.get('a')).toBeDefined();
    expect(cache.size()).toBe(1);
  });

  it('refreshes recency on get so older keys evict first', () => {
    const cache = new ContainerCache(2);
    cache.put('a', stub('A'));
    cache.put('b', stub('B'));
    // Touch 'a' so it becomes most-recently-used.
    expect(cache.get('a')).toBeDefined();
    cache.put('c', stub('C'));
    expect(cache.get('b')).toBeUndefined(); // evicted as LRU
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('evicts a specific key', () => {
    const cache = new ContainerCache(3);
    cache.put('a', stub('A'));
    cache.put('b', stub('B'));
    cache.evict('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
    expect(cache.size()).toBe(1);
  });

  it('clear empties the cache', () => {
    const cache = new ContainerCache(3);
    cache.put('a', stub('A'));
    cache.put('b', stub('B'));
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('overwriting a key updates the value and refreshes recency', () => {
    const cache = new ContainerCache(2);
    cache.put('a', stub('A1'));
    cache.put('b', stub('B'));
    cache.put('a', stub('A2'));
    cache.put('c', stub('C')); // forces eviction; b is now LRU
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });
});
