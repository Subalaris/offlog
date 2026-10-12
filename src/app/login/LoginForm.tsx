"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeAuthDestination } from "@/lib/authRedirect";

export function LoginForm({ next = "/", initialError = "" }: { next?: string; initialError?: string }) {
  const destination = safeAuthDestination(next);
  const navigating = useRef(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialError);
  const [isError, setIsError] = useState(Boolean(initialError));

  useEffect(() => {
    const supabase = createClient();
    // Also finish sign-in when the browser client receives an older email link.
    const finishSignIn = () => {
      if (navigating.current) return;
      navigating.current = true;
      window.location.replace(destination);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finishSignIn();
    });
    return () => subscription.unsubscribe();
  }, [destination]);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setIsError(false);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", destination);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
      });
      if (error) throw error;
      setCodeSent(true);
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "Could not send your sign-in email. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setIsError(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (error) throw error;
      if (!navigating.current) {
        navigating.current = true;
        window.location.replace(destination);
      }
    } catch (caught) {
      setIsError(true);
      setMessage(caught instanceof Error ? caught.message : "Could not verify your code. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="logo auth-logo">
        <div className="logo-mark">✈</div>
        <span>OffLog</span>
      </div>
      <div>
        <h1>{codeSent ? "Check your email" : "Welcome to OffLog"}</h1>
        <p className="auth-subtitle">
          {codeSent
            ? `Open the sign-in link sent to ${email.trim()} to continue. If your email contains a code, you can enter it below.`
            : "Sign in or create an account with your email."}
        </p>
      </div>

      {!codeSent ? (
        <form onSubmit={sendCode} className="auth-form">
          <label className="field">
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Sending…" : "Send sign-in email"}
          </button>
        </form>
      ) : (
        <div>
          <details className="auth-code-option">
            <summary>Have a sign-in code?</summary>
            <form onSubmit={verifyCode} className="auth-form">
              <label className="field">
                Sign-in code
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  required
                />
              </label>
              <button className="btn btn-primary" disabled={pending}>
                {pending ? "Checking…" : "Continue"}
              </button>
            </form>
          </details>
          <div className="auth-form">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={(event) => void sendCode(event)}
            >
              {pending ? "Sending…" : "Resend email"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => {
                setCodeSent(false);
                setCode("");
                setMessage("");
                setIsError(false);
              }}
            >
              Use another email
            </button>
          </div>
        </div>
      )}

      {message && <p role={isError ? "alert" : "status"} className={`auth-message ${isError ? "auth-error" : ""}`}>{message}</p>}
    </div>
  );
}
