import { useSearchParams } from 'react-router-dom';
import { ImportTezos } from './ImportTezos';
import { ImportEvm } from './ImportEvm';

export function Import({ onDone }: { onDone: () => void }) {
  const [params] = useSearchParams();
  const kind = params.get('kind') === 'evm' ? 'evm' : 'tezos';
  return kind === 'evm' ? <ImportEvm onDone={onDone} /> : <ImportTezos onDone={onDone} />;
}
