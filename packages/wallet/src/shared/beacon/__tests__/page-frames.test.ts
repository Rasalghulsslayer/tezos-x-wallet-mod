import { describe, expect, it } from 'vitest';
import { Serializer } from '@airgap/beacon-core';
import { ExtensionMessageTarget, PostMessagePairingRequest } from '@airgap/beacon-types';
import {
  BEACON_HANDOFF_KEY,
  BEACON_WALLET_NAME,
  TO_EXTENSION,
  TO_PAGE,
  buildPongFrame,
  classifyPageFrame,
  readPairingRequest,
  wrapToPageFrame,
} from '../page-frames';

const OUR_ID   = 'abcdefghijklmnopqrstuvwxyzabcdef';
const OTHER_ID = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
const PUBKEY   = 'a'.repeat(64);

describe('the SDK enum values this module re-states as literals', () => {
  // `page-frames.ts` imports @airgap/beacon-types as TYPES ONLY, because a single
  // value import makes @crxjs emit the content script behind an async loader
  // instead of a synchronous IIFE — which decides whether the window listener
  // exists before page script runs. These assertions are what keep the literals
  // honest, here and in the import-free `content/beacon-announce.ts`.
  it('match ExtensionMessageTarget exactly', () => {
    expect(TO_EXTENSION).toBe(ExtensionMessageTarget.EXTENSION);
    expect(TO_PAGE).toBe(ExtensionMessageTarget.PAGE);
  });

  it('are the two the dApp actually reads', () => {
    expect(TO_EXTENSION).toBe('toExtension');
    expect(TO_PAGE).toBe('toPage');
  });

  it('names the hand-off property the import-free half also uses', () => {
    expect(BEACON_HANDOFF_KEY).toBe('__tezosxBeaconHandoff');
  });
});

describe('classifyPageFrame', () => {
  it('answers the discovery ping, which carries no targetId', () => {
    expect(classifyPageFrame({ target: 'toExtension', payload: 'ping' }, OUR_ID))
      .toEqual({ kind: 'ping' });
  });

  it('answers a ping even when another extension is named, because it is a broadcast', () => {
    // PostMessageTransport.listenForExtensions posts no targetId at all; this
    // guards against a future SDK adding one and every wallet going invisible.
    expect(classifyPageFrame({ target: 'toExtension', payload: 'ping', targetId: OTHER_ID }, OUR_ID))
      .toEqual({ kind: 'ping' });
  });

  it('takes a pairing request addressed to this extension', () => {
    expect(classifyPageFrame({ target: 'toExtension', payload: 'serialized', targetId: OUR_ID }, OUR_ID))
      .toEqual({ kind: 'pairing', payload: 'serialized' });
  });

  it('takes a pairing request with no targetId', () => {
    expect(classifyPageFrame({ target: 'toExtension', payload: 'serialized' }, OUR_ID))
      .toEqual({ kind: 'pairing', payload: 'serialized' });
  });

  // Three wallet extensions on one page is the real configuration this came
  // from — answering another extension's pairing is how "which popup am I
  // confirming?" becomes unanswerable.
  it('ignores a pairing request addressed to a different extension', () => {
    expect(classifyPageFrame({ target: 'toExtension', payload: 'serialized', targetId: OTHER_ID }, OUR_ID))
      .toEqual({ kind: 'ignore' });
  });

  it('takes an encrypted message addressed to this extension', () => {
    expect(classifyPageFrame({ target: 'toExtension', encryptedPayload: 'deadbeef', targetId: OUR_ID }, OUR_ID))
      .toEqual({ kind: 'message', encryptedPayload: 'deadbeef' });
  });

  it('ignores an encrypted message addressed to a different extension', () => {
    expect(classifyPageFrame({ target: 'toExtension', encryptedPayload: 'deadbeef', targetId: OTHER_ID }, OUR_ID))
      .toEqual({ kind: 'ignore' });
  });

  it('prefers encryptedPayload over payload when a frame carries both', () => {
    expect(classifyPageFrame({ target: 'toExtension', payload: 'x', encryptedPayload: 'deadbeef' }, OUR_ID))
      .toEqual({ kind: 'message', encryptedPayload: 'deadbeef' });
  });

  it('ignores our own outbound frames coming back on the same window', () => {
    expect(classifyPageFrame({ target: 'toPage', payload: 'pong' }, OUR_ID)).toEqual({ kind: 'ignore' });
    expect(classifyPageFrame(wrapToPageFrame(
      { target: ExtensionMessageTarget.PAGE, encryptedPayload: 'deadbeef' }, OUR_ID,
    ), OUR_ID)).toEqual({ kind: 'ignore' });
  });

  it('ignores the EIP-1193 bridge traffic sharing this window', () => {
    // The two content scripts listen on the same window; neither may consume the
    // other's frames.
    for (const type of ['TEZOSX_WALLET_REQUEST', 'TEZOSX_WALLET_RESPONSE', 'TEZOSX_WALLET_EVENT', 'TEZOSX_WALLET_ROLE']) {
      expect(classifyPageFrame({ type, requestId: 'x', args: { method: 'eth_chainId' } }, OUR_ID))
        .toEqual({ kind: 'ignore' });
    }
  });

  it('survives the non-object frames the SDK itself posts', () => {
    // PostMessageTransport.addExtension posts the bare string 'extensionsUpdated'.
    for (const data of ['extensionsUpdated', null, undefined, 42, [], () => undefined]) {
      expect(classifyPageFrame(data, OUR_ID)).toEqual({ kind: 'ignore' });
    }
  });

  it('ignores a toExtension frame carrying neither payload nor encryptedPayload', () => {
    expect(classifyPageFrame({ target: 'toExtension' }, OUR_ID)).toEqual({ kind: 'ignore' });
    expect(classifyPageFrame({ target: 'toExtension', payload: '' }, OUR_ID)).toEqual({ kind: 'ignore' });
    expect(classifyPageFrame({ target: 'toExtension', encryptedPayload: '' }, OUR_ID)).toEqual({ kind: 'ignore' });
  });

  it('ignores a non-string payload, which cannot be a serialized pairing request', () => {
    expect(classifyPageFrame({ target: 'toExtension', payload: { id: 'x' } }, OUR_ID)).toEqual({ kind: 'ignore' });
  });
});

describe('buildPongFrame', () => {
  // FLAT, not nested under `message`: PostMessageTransport.listenForExtensions
  // reads event.data.payload and event.data.sender. Nesting it makes the wallet
  // invisible in the pairing modal with no error anywhere.
  it('puts payload and sender at the top level', () => {
    const frame = buildPongFrame({ id: OUR_ID, name: BEACON_WALLET_NAME });
    expect(frame.payload).toBe('pong');
    expect(frame.sender).toEqual({ id: OUR_ID, name: BEACON_WALLET_NAME });
    expect(frame.target).toBe(ExtensionMessageTarget.PAGE);
    expect('message' in frame).toBe(false);
  });

  it('carries the name the dApp will report as the paired wallet', () => {
    expect(BEACON_WALLET_NAME).toBe('TezosX Wallet');
  });
});

describe('wrapToPageFrame', () => {
  // NESTED, with sender.id: PostMessageClient.listenForChannelOpening reads
  // event.data.message.target / .payload and event.data.sender.id.
  it('nests the frame under `message` and stamps sender.id', () => {
    const wrapped = wrapToPageFrame({ target: ExtensionMessageTarget.PAGE, payload: 'sealed' }, OUR_ID);
    expect(wrapped).toEqual({
      message: { target: 'toPage', payload: 'sealed' },
      sender:  { id: OUR_ID },
    });
  });

  it('nests an encrypted frame the same way', () => {
    const wrapped = wrapToPageFrame(
      { target: ExtensionMessageTarget.PAGE, encryptedPayload: 'deadbeef' }, OUR_ID,
    );
    expect(wrapped.message).toEqual({ target: 'toPage', encryptedPayload: 'deadbeef' });
    expect(wrapped.sender.id).toBe(OUR_ID);
  });
});

describe('readPairingRequest', () => {
  it('accepts what the SDK actually serializes', async () => {
    const request = new PostMessagePairingRequest('req-1', 'MAPS', PUBKEY, '3');
    const roundTripped = await new Serializer().deserialize(await new Serializer().serialize(request));
    expect(readPairingRequest(roundTripped)).toEqual({
      id: 'req-1', name: 'MAPS', publicKey: PUBKEY, version: '3',
    });
  });

  it('rejects a publicKey that is not 32 bytes of hex', () => {
    // It is fed straight to a cryptobox, so "a string" is not good enough.
    for (const publicKey of ['', 'zz', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'edpktest']) {
      expect(readPairingRequest({
        type: 'postmessage-pairing-request', id: 'x', name: 'n', publicKey, version: '3',
      }), publicKey).toBeNull();
    }
  });

  it('accepts uppercase hex', () => {
    expect(readPairingRequest({
      type: 'postmessage-pairing-request', id: 'x', name: 'n', publicKey: 'A'.repeat(64), version: '3',
    })).not.toBeNull();
  });

  it('rejects a wrong or missing type', () => {
    expect(readPairingRequest({
      type: 'postmessage-pairing-response', id: 'x', name: 'n', publicKey: PUBKEY, version: '3',
    })).toBeNull();
    expect(readPairingRequest({ id: 'x', name: 'n', publicKey: PUBKEY, version: '3' })).toBeNull();
  });

  it('rejects a missing id or version', () => {
    expect(readPairingRequest({ type: 'postmessage-pairing-request', name: 'n', publicKey: PUBKEY, version: '3' })).toBeNull();
    expect(readPairingRequest({ type: 'postmessage-pairing-request', id: '', name: 'n', publicKey: PUBKEY, version: '3' })).toBeNull();
    expect(readPairingRequest({ type: 'postmessage-pairing-request', id: 'x', name: 'n', publicKey: PUBKEY })).toBeNull();
  });

  it('tolerates a nameless dApp — the name is only ever displayed', () => {
    expect(readPairingRequest({
      type: 'postmessage-pairing-request', id: 'x', publicKey: PUBKEY, version: '3',
    })?.name).toBe('Unknown dApp');
  });

  it('rejects non-objects', () => {
    for (const value of [null, undefined, 'x', 42, []]) {
      expect(readPairingRequest(value)).toBeNull();
    }
  });

  // A pairing is accepted with NO user prompt and the peer is persisted to the
  // same 10 MB chrome.storage.local namespace the encrypted vault lives in. One
  // frame with a multi-megabyte `name` would fill it in a single write.
  it('clamps the page-supplied strings instead of storing them at any length', () => {
    const read = readPairingRequest({
      type:      'postmessage-pairing-request',
      id:        'i'.repeat(5000),
      name:      'n'.repeat(5_000_000),
      publicKey: PUBKEY,
      version:   'v'.repeat(5000),
    });
    expect(read).not.toBeNull();
    expect(read!.id.length).toBe(128);
    expect(read!.name.length).toBe(128);
    expect(read!.version.length).toBe(128);
  });

  it('still pairs a dApp with a long display name rather than refusing it', () => {
    // Clamped, not rejected: the name is only ever displayed.
    const read = readPairingRequest({
      type: 'postmessage-pairing-request', id: 'x',
      name: 'MAPS — Multi-Asset Privacy Solution'.repeat(20),
      publicKey: PUBKEY, version: '3',
    });
    expect(read?.name.startsWith('MAPS — Multi-Asset Privacy Solution')).toBe(true);
  });

  it('leaves the publicKey exactly as validated', () => {
    // 64 hex is already the bound; clamping it would corrupt a valid key.
    expect(readPairingRequest({
      type: 'postmessage-pairing-request', id: 'x', name: 'n', publicKey: PUBKEY, version: '3',
    })?.publicKey).toBe(PUBKEY);
  });
});
