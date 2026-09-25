import { useState, useEffect, useCallback } from "react";
import { getUser, handleAuthCallback, onAuthChange, logout as identityLogout, updateUser, AUTH_EVENTS, AuthError } from "@netlify/identity";
import AuthPage from "./AuthPage.jsx";
import Modal from "./Modal.jsx";
import App from "./App.jsx";

function SetNewPasswordModal({ onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await updateUser({ password });
      onDone();
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={() => {}}>
      <div className="modal-title">Set a new password</div>
      <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "14px" }}>
        You requested a password reset. Choose a new password to finish logging in.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>New password</label>
          <input className="input" type="password" minLength={6} required placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading} type="submit">
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </Modal>
  );
}

export default function AuthGate() {
  const [user, setUser]                     = useState(null);
  const [ready, setReady]                   = useState(false);
  const [notice, setNotice]                 = useState("");
  const [needsNewPassword, setNeedsNewPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      let callbackUser = null;
      try {
        const result = await handleAuthCallback();
        if (result?.user) {
          callbackUser = result.user;
          if (result.type === "confirmation") setNotice("Email confirmed — you're in.");
          if (result.type === "email_change") setNotice("Email address updated.");
          if (result.type === "recovery") setNeedsNewPassword(true);
        }
      } catch {
        // no auth callback in the URL, or it was malformed — fall through to a normal session check
      }
      const current = callbackUser || (await getUser());
      if (mounted) { setUser(current); setReady(true); }
    })();

    const unsubscribe = onAuthChange((event, u) => {
      if (event === AUTH_EVENTS.LOGIN || event === AUTH_EVENTS.USER_UPDATED) setUser(u);
      if (event === AUTH_EVENTS.LOGOUT) setUser(null);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const handleLogout = useCallback(async () => {
    await identityLogout();
    setUser(null);
  }, []);

  if (!ready) return <div className="loading">Loading FreelanceFlow…</div>;
  if (!user) return <AuthPage onAuthenticated={setUser} notice={notice} />;

  return (
    <>
      <App user={user} onLogout={handleLogout} />
      {needsNewPassword && <SetNewPasswordModal onDone={() => setNeedsNewPassword(false)} />}
    </>
  );
}
