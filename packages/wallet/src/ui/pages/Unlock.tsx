import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { sendPopupRequest } from '@/lib/messaging';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Unlock({ onDone }: { onDone: () => void }) {
  const navigate           = useNavigate();
  const [password, setPwd] = useState('');
  const [error,    setErr] = useState<string | null>(null);
  const [loading,  setLd]  = useState(false);

  const submit = async () => {
    setErr(null);
    if (password.length === 0) return;

    setLd(true);
    try {
      await sendPopupRequest({ type: 'UNLOCK', password });
      onDone();
      navigate('/', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
      setPwd('');
    } finally {
      setLd(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-150 gap-6 p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
        <Lock className="h-7 w-7" />
      </div>

      <div className="text-center">
        <h1 className="text-lg font-bold">Welcome back</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Enter your password to unlock.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="w-full space-y-3"
      >
        <div>
          <Label htmlFor="pwd">Password</Label>
          <Input
            id="pwd"
            type="password"
            value={password}
            onChange={(e) => setPwd(e.target.value)}
            autoFocus
            placeholder="••••••••"
          />
        </div>
        {error != null && <p className="text-xs text-red-400">{error}</p>}

        <Button type="submit" disabled={loading || password.length === 0} className="w-full">
          {loading ? 'Unlocking…' : 'Unlock'}
        </Button>
      </form>

      <button
        onClick={() => navigate('/import')}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Forgot password? Import with seed phrase
      </button>
    </div>
  );
}
