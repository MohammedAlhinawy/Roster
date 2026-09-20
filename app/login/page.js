'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LuCloudOff } from 'react-icons/lu';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../context/AuthContext';

function goLocal() {
  document.cookie = 'dutyroster.local=1; path=/; max-age=' + 60 * 60 * 24 * 30;
  // Hard navigation: guarantees the proxy re-evaluates the new cookie and
  // reloads the app fresh (a soft router.push can race/be overridden).
  window.location.href = '/';
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  if (user) return null;
  const backTo = params.get('redirectedFrom') || '';

  async function submit(e) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(backTo ? `/${backTo}` : '/');
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <Image className="auth-logo" src="/icon.png" alt="DutyRoster" width={56} height={56} priority />
          <p className="auth-overline">DutyRoster</p>
          <h1 className="auth-title">Welcome back</h1>
          <p className="muted-note">Sign in to sync your roster and alarms across your devices.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" required />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button type="button" className="auth-ghost" onClick={goLocal}>
          <LuCloudOff /> Use without an account
        </button>
        <p className="auth-links">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </main>
  );
}