"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setPending(false);
    if (error) return setMessage(error.message);
    setCodeSent(true);
    setMessage("Check your email for your sign-in code.");
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setPending(false);
    if (error) return setMessage(error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div className="logo auth-logo">
        <div className="logo-mark">✈</div>
        <span>OffLog</span>
      </div>
      <div>
        <h1>{codeSent ? "Enter your code" : "Welcome to OffLog"}</h1>
        <p className="auth-subtitle">
          {codeSent
            ? `We sent a one-time code to ${email}.`
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
            {pending ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
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
              autoFocus
            />
          </label>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setMessage("");
            }}
          >
            Use another email
          </button>
        </form>
      )}

      {message && <p className={message.startsWith("Check") ? "auth-message" : "auth-message auth-error"}>{message}</p>}
    </div>
  );
}
