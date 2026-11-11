import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Headset, LoaderCircle, Lock, MessagesSquare, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useAuth, homeForRole } from "../lib/auth";
import { errorMessage } from "../lib/api";
import { Button, ErrorNote } from "../components/ui";
import { useTitle } from "../lib/hooks";

const DEMO_ACCOUNTS = [
  {
    role: "Customer",
    name: "Maya Chen",
    email: "maya@northwind.co",
    detail: "Northwind Labs",
    icon: MessagesSquare,
  },
  {
    role: "IT support",
    name: "Alex Rivera",
    email: "alex@supportiq.app",
    detail: "Tier 2 Support Engineer",
    icon: Headset,
  },
  {
    role: "Administrator",
    name: "Jordan Blake",
    email: "admin@supportiq.app",
    detail: "Head of Customer Operations",
    icon: ShieldCheck,
  },
];

const PASSWORD = "support123";

export default function LoginPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useTitle("Sign in");

  useEffect(() => {
    if (user) navigate(homeForRole(user.role), { replace: true });
  }, [user, navigate]);

  if (ready && user) return <Navigate to={homeForRole(user.role)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      navigate(homeForRole(signedIn.role), { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword(PASSWORD);
    setError(null);
  };

  return (
    <div className="login">
      <section className="login-brand">
        <div className="login-top">
          <span className="brand-mark brand-mark-lg">
            <Headset size={20} strokeWidth={2.1} />
          </span>
          <div>
            <strong className="login-wordmark">SupportIQ</strong>
            <span className="login-wordmark-sub">Official support platform</span>
          </div>
        </div>

        <div className="login-pitch">
          <p className="login-eyebrow">One thread from question to resolution</p>
          <h1 className="login-headline">
            Every support request,
            <br />
            in one clear place.
          </h1>
          <p className="login-lede">
            Customers ask for help, IT support resolves it, and admins see the full picture — all inside
            SupportIQ. No side channels, no lost context.
          </p>

          <ul className="login-features">
            <li>
              <span className="login-feature-icon">
                <MessagesSquare size={16} />
              </span>
              <div>
                <strong>Customer portal</strong>
                <p>Ask the support assistant or IT, attach screenshots, follow every status change, and rate the service.</p>
              </div>
            </li>
            <li>
              <span className="login-feature-icon">
                <Users size={16} />
              </span>
              <div>
                <strong>IT support portal</strong>
                <p>A single queue with SLA context, canned replies, internal notes, and a clean resolution flow.</p>
              </div>
            </li>
            <li>
              <span className="login-feature-icon">
                <ShieldCheck size={16} />
              </span>
              <div>
                <strong>Admin monitoring</strong>
                <p>Response times, late tickets, satisfaction, reassignment, and control over automated replies.</p>
              </div>
            </li>
          </ul>
        </div>

        <p className="login-foot">
          <Lock size={13} />
          Support-only assistant. It never sends sales or promotional messages.
        </p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h2 className="login-title">Sign in to SupportIQ</h2>
          <p className="login-sub">Use your work email to reach your support workspace.</p>

          <form className="login-form" onSubmit={submit}>
            {location.state?.accountCreated ? (
              <p className="success-note" role="status">Account created. Sign in to continue.</p>
            ) : null}
            {error ? <ErrorNote message={error} /> : null}
            <div className="field">
              <label className="label" htmlFor="email">
                Work email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div style={{ textAlign: "right", marginTop: -8 }}>
              <Link to="/forgot-password" className="login-link" style={{ fontSize: "0.8rem" }}>
                Forgot password?
              </Link>
            </div>
            <Button type="submit" size="lg" className="btn-block" disabled={submitting}>
              {submitting ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="login-legal">
            New to SupportIQ? <Link to="/register">Create account</Link>
          </p>

          <div className="demo-box">
            <div className="demo-head">
              <span className="demo-head-title">
                <Sparkles size={13} aria-hidden="true" />
                Explore a demo workspace
              </span>
              <span className="demo-password">password: {PASSWORD}</span>
            </div>
            <div className="demo-list" role="group" aria-label="Demo accounts">
              {DEMO_ACCOUNTS.map((account) => {
                const Icon = account.icon;
                const selected = email === account.email;
                return (
                  <button
                    key={account.email}
                    type="button"
                    className={`demo-option ${selected ? "is-selected" : ""}`.trim()}
                    onClick={() => fillDemo(account.email)}
                    aria-pressed={selected}
                  >
                    <span className="demo-option-icon" aria-hidden="true">
                      <Icon size={17} strokeWidth={2} />
                    </span>
                    <span className="demo-option-text">
                      <span className="demo-role">{account.role}</span>
                      <span className="demo-name">{account.name}</span>
                      <span className="demo-detail">{account.detail}</span>
                    </span>
                    <Check className="demo-option-check" size={15} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <p className="demo-hint">Pick a role to fill the form, then sign in to see that portal.</p>
          </div>

          <p className="login-legal">
            All customer and IT communication happens inside SupportIQ. Sessions are private to this workspace.
          </p>
        </div>
      </section>
    </div>
  );
}
