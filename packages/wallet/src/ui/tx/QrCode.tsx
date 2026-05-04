export function QrCode({ value = 'tz1abc' }: { value?: string }) {
  const size = 21;
  const cells: React.ReactNode[] = [];
  let seed = 0;
  for (let i = 0; i < value.length; i++) seed = (seed * 33 + value.charCodeAt(i)) >>> 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isCorner =
        (x < 7 && y < 7) ||
        (x >= size - 7 && y < 7) ||
        (x < 7 && y >= size - 7);
      const cornerOn =
        isCorner &&
        (x === 0 ||
          x === 6 ||
          y === 0 ||
          y === 6 ||
          x === size - 1 ||
          x === size - 7 ||
          y === size - 7 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
          (x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4) ||
          (x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3));
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const on = isCorner ? cornerOn : (seed & 1) === 0 && !(x === 10 && y === 10);
      cells.push(<span key={`${x}-${y}`} className={on ? 'cell' : 'cell off'} />);
    }
  }
  return <div className="tx-qr">{cells}</div>;
}
