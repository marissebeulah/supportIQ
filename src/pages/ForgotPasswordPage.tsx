import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Headset, LoaderCircle } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { Button, ErrorNote } from "../components/ui";
import { useTitle } from "../lib/hooks";

export default function ForgotPasswordPage() {
  useTitle("Forgot password");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/auth/forgot-password", { email: email.trim() });
      setSuccess(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <section className="login-panel" style={{ width: "100%" }}>
        <div className="login-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span className="brand-mark">
              <Headset size={17} strokeWidth={2.1} />
            </span>
            <strong>SupportIQ</strong>
          </div>
          <p className="eyebrow">Account recovery</p>
          <h2 className="login-title">Forgot your password?</h2>
          <p className="login-sub">
            Enter your email address. If we find your account, we'll let your administrator know to reset your access.
          </p>

          {success ? (
            <div>
              <p className="success-note" role="status">
                Done. Contact your administrator — they can set a new password for your account.
              </p>
              <p className="login-legal" style={{ marginTop: 16 }}>
                <Link to="/login">Back to sign in</Link>
              </p>
            </div>
          ) : (
            <form className="login-form" onSubmit={submit}>
              {error ? <ErrorNote message={error} /> : null}
              <div className="field">
                <label className="label" htmlFor="forgot-email">
                  Work email
                </label>
                <input
                  id="forgot-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" size="lg" className="btn-block" disabled={submitting}>
                {submitting ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
                {submitting ? "Sending…" : "Request password reset"}
              </Button>
              <p className="login-legal">
                <Link to="/login">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
