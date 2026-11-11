import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { Button, ErrorNote } from "../components/ui";
import { useTitle } from "../lib/hooks";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useTitle("Create account");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/auth/register", { name, email, password });
      navigate("/login", { replace: true, state: { accountCreated: true } });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login">
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Customer workspace</p>
          <h1 className="login-title">Create your SupportIQ account</h1>
          <p className="login-sub">Your requests and support conversations stay together in SupportIQ.</p>
          <form className="login-form" onSubmit={submit}>
            {error ? <ErrorNote message={error} /> : null}
            <div className="field">
              <label className="label" htmlFor="account-name">Your name</label>
              <input
                id="account-name"
                className="input"
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="account-email">Work email</label>
              <input
                id="account-email"
                className="input"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="account-password">Password</label>
              <input
                id="account-password"
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <small>Use at least 8 characters.</small>
            </div>
            <Button type="submit" size="lg" className="btn-block" disabled={submitting}>
              {submitting ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="login-legal">
            Already have an account? <Link to="/login">Sign in</Link>. Customer and IT communication stays inside SupportIQ.
          </p>
        </div>
      </section>
    </main>
  );
}
