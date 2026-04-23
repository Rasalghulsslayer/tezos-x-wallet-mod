import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { isValidMnemonic } from '@/lib/seed';
import { sendPopupRequest } from '@/lib/messaging';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Import({ onDone }: { onDone: () => void }) {
  const navigate           = useNavigate();
  const [mnemonic, setM]   = useState('');
  const [password, setPwd] = useState('');
  const [confirm,  setCnf] = useState('');
  const [error,    setErr] = useState<string | null>(null);
  const [loading,  setLd]  = useState(false);

  const submit = async () => {
    setErr(null);
    const trimmed = mnemonic.trim().toLowerCase();
    if (!isValidMnemonic(trimmed))   return setErr('Invalid BIP39 mnemonic');
    if (password.length < 8)          return setErr('Password must be at least 8 characters');
    if (password !== confirm)         return setErr('Passwords do not match');

    setLd(true);
    try {
      await sendPopupRequest({ type: 'IMPORT_WALLET', mnemonic: trimmed, password });
      onDone();
      navigate('/', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLd(false);
    }
  };

  return (
    <div className="flex flex-col min-h-150 p-4 gap-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      <header>
        <h1 className="text-lg font-bold">Import a seed</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Paste your 12/15/18/21/24-word BIP39 mnemonic.
        </p>
      </header>

      <div className="space-y-3">
        <div>
          <Label htmlFor="mn">Recovery phrase</Label>
          <textarea
            id="mn"
            value={mnemonic}
            onChange={(e) => setM(e.target.value)}
            placeholder="word1 word2 word3 …"
            rows={4}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none resize-none font-mono"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPwd(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" value={confirm} onChange={(e) => setCnf(e.target.value)} />
        </div>

        {error != null && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <Button onClick={submit} disabled={loading} className="w-full mt-auto">
        {loading ? 'Importing…' : 'Import wallet'}
      </Button>
    </div>
  );
}
