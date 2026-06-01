import type { ActivityRowVM } from '../view-models/activity-vm';

/**
 * Glyph rendered inside the identicon ring of an ActivityRow. Picks an SVG
 * shape based on the row's verb (Sent / Received / Contract call / Signed /
 * Failed / unknown) and its cross-runtime direction.
 */
export function ActivityCoreGlyph({ vm }: { vm: ActivityRowVM }) {
  if (vm.status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (vm.verb === 'Contract call') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="2.5" y="3" width="9" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.5 6h5M4.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (vm.verb === 'Signed message') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 10l3-7 2 5 2-2 1 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // transfer / unknown — choose by direction
  if (vm.runtimeBadge === 'cross') {
    if (vm.arrow === '←') {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M9 6H3M9 8H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M3 4l-2 2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 6h6M3 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M9 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (vm.arrow === '←') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 4v4M5 6l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (vm.arrow === '·') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 7l2 2 3-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
