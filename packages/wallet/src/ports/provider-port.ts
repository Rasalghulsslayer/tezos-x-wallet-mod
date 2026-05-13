/**
 * ProviderPort: EIP-1193 provider abstraction. Aliases the relayer's
 * EIP1193Provider; an EVM-native provider in W4 satisfies the same shape.
 */

import type { EIP1193Provider } from '@tezosx/relayer/types';

export type ProviderPort = EIP1193Provider;
