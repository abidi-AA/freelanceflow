import { useState } from "react";
import { login, signup, requestPasswordRecovery, getUser, AuthError, MissingIdentityError } from "@netlify/identity";

const MODES = { login: "login", signup: "signup", forgot: "forgot" };

function authErrorMessage(error) {
  if (error instanceof MissingIdentityError) {
    return "Sign-in isn't available in this environment yet.";
  }
  if (error instanceof AuthError) {
    switch (error.status) {
      case 401: return "Invalid email or password.";
      case 403: return "Signups are currently disabled — contact the site owner.";
      case 422: return "Check your email and password — password must be at least 6 characters.";
      case 404: return "No account found with that email.";
      default: return error.message || "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export default function AuthPage({ onAuthenticated, notice }) {
  const [mode, setMode]       = useState(MODES.login);
  const [form, setForm]       = useState({ name: "", email: "", password: "" });
  const [error, setError]     = useState("");
  const [info, setInfo]       = useState(notice || "");
  const [loading, setLoading] = useState(false);

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }
  function switchMode(next) { setMode(next); setError(""); setInfo(""); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setInfo(""); setLoading(true);
    try {
      if (mode === MODES.login) {
        onAuthenticated(await login(form.email, form.password));
      } else if (mode === MODES.signup) {
        await signup(form.email, form.password, { full_name: form.name });
        const loggedIn = await getUser();
        if (loggedIn) {
          onAuthenticated(loggedIn);
        } else {
          setInfo("Account created — check your email to confirm it, then log in.");
          setMode(MODES.login);
        }
      } else if (mode === MODES.forgot) {
        await requestPasswordRecovery(form.email);
        setInfo("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon">🌊</div>
        <h1 className="auth-title">FreelanceFlow</h1>
        <p className="auth-sub">
          {mode === MODES.login  && "Welcome back. Log in to your account."}
          {mode === MODES.signup && "Create your account — takes less than a minute."}
          {mode === MODES.forgot && "Enter your email and we'll send a reset link."}
        </p>

        {info  && <div className="auth-notice">{info}</div>}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === MODES.signup && (
            <div className="field">
              <label>Name</label>
              <input className="input" placeholder="Your name" value={form.name} onChange={e => update("name", e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={e => update("email", e.target.value)} required />
          </div>
          {mode !== MODES.forgot && (
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" placeholder="At least 6 characters" minLength={6} value={form.password} onChange={e => update("password", e.target.value)} required />
            </div>
          )}
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "4px" }} disabled={loading} type="submit">
            {loading ? "Please wait…" : mode === MODES.login ? "Log in" : mode === MODES.signup ? "Create account" : "Send reset link"}
          </button>
        </form>

        <div className="auth-links">
          {mode === MODES.login && (
            <>
              <button className="link-btn" onClick={() => switchMode(MODES.forgot)}>Forgot password?</button>
              <span className="auth-links-sep">·</span>
              <button className="link-btn" onClick={() => switchMode(MODES.signup)}>Create an account</button>
            </>
          )}
          {mode === MODES.signup && (
            <button className="link-btn" onClick={() => switchMode(MODES.login)}>Already have an account? Log in</button>
          )}
          {mode === MODES.forgot && (
            <button className="link-btn" onClick={() => switchMode(MODES.login)}>Back to log in</button>
          )}
        </div>
      </div>
    </div>
  );
}
