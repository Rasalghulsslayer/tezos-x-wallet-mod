export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      className="inline-block animate-spin rounded-full border-2 border-slate-800 border-t-brand-500"
      style={{ width: size, height: size }}
    />
  );
}
