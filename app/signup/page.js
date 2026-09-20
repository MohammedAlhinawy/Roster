'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LuCloudOff } from 'react-icons/lu';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../context/AuthContext';

export default function SignupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  if (user) return null;

  async function submit(e) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is disabled in the dashboard → straight in.
      router.push('/');
      router.refresh();
    } else {
      setMessage('Account created. Check your email to confirm, then sign in.');
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <Image className="auth-logo" src="/icon.png" alt="DutyRoster" width={56} height={56} priority />
          <p className="auth-overline">DutyRoster</p>
          <h1 className="auth-title">Create your account</h1>
          <p className="muted-note">Your roster, identity and alarms sync across all your devices. Files you import never leave the device.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>Password
            <input type="password" value={password} minLength={6} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 6 characters" required />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-ok" role="status">{message}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button type="button" className="auth-ghost" onClick={() => {
          document.cookie = 'dutyroster.local=1; path=/; max-age=' + 60 * 60 * 24 * 30;
          window.location.href = '/';
        }}>
          <LuCloudOff /> Use without an account
        </button>
        <p className="auth-links">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}