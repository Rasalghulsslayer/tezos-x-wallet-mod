import { useSearchParams } from 'react-router-dom';
import { CreateTezos } from './CreateTezos';
import { CreateEvm } from './CreateEvm';

export function Create({ onDone }: { onDone: () => void }) {
  const [params] = useSearchParams();
  const kind = params.get('kind') === 'evm' ? 'evm' : 'tezos';
  return kind === 'evm' ? <CreateEvm onDone={onDone} /> : <CreateTezos onDone={onDone} />;
}
