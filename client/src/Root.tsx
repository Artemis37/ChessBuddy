import { useEffect, useState } from "react";
import { api, SIGNED_OUT_EVENT } from "./api";
import { App } from "./App";
import { LoginScreen } from "./components/LoginScreen";

/** Shows the sign-in screen until there's a session, then the app. */
export function Root() {
  /** undefined while checking the session cookie, null when signed out. */
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    api.me().then(
      (session) => alive && setUser(session.username),
      () => alive && setUser(null),
    );
    const signedOut = () => setUser(null);
    window.addEventListener(SIGNED_OUT_EVENT, signedOut);
    return () => {
      alive = false;
      window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
    };
  }, []);

  if (user === undefined) return null;
  if (user === null) return <LoginScreen onSignedIn={setUser} />;
  const signOut = () =>
    api
      .logout()
      .catch(() => {})
      .then(() => setUser(null));
  return <App user={user} onSignOut={signOut} />;
}
