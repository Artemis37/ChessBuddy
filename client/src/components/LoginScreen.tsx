import { useEffect, useState, type FormEvent } from "react";
import type { SessionResponse } from "../../../shared/types";
import { api } from "../api";

/** A paused free-tier database takes a while to wake up, so a slow sign-in says why. */
const SLOW_SIGN_IN_MS = 4000;

export function LoginScreen({ onSignedIn }: { onSignedIn: (session: SessionResponse) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), SLOW_SIGN_IN_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [busy]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    api.login(username, password).then(
      (session) => onSignedIn(session),
      (err: Error) => {
        setError(err.message);
        setBusy(false);
      },
    );
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <h1>
          <img src="/pieces/staunty/wN.svg" alt="" aria-hidden /> ChessBuddy
        </h1>
        <p className="muted">Private system. Sign in with your account.</p>

        <label className="field">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {slow && <p className="muted login-note">Waking up the database. This can take up to a minute.</p>}
      </form>
    </div>
  );
}
