/**
 * The hand-off between the wallet's two Beacon content scripts, declared
 * ambiently because one of them cannot import anything.
 *
 * `content/beacon-announce.ts` must be emitted as a synchronous IIFE so its
 * `window` listener exists before page script runs (Beacon's discovery ping is
 * one-shot), and @crxjs only emits an IIFE for a file with no imports at all —
 * which also means no `import`/`export`, so that file is a SCRIPT and cannot
 * carry a `declare global` of its own. Hence this ambient declaration, which both
 * halves pick up through `tsconfig`'s `include: ["src"]`.
 */

interface BeaconHandoff {
  /** Raw `event.data` frames, in arrival order, waiting for the SDK half. */
  buffered: unknown[];
  /** Installed by the SDK half once it is ready; supersedes `buffered`. */
  onFrame?: (data: unknown) => void;
}

interface Window {
  __tezosxBeaconHandoff?: BeaconHandoff;
}
