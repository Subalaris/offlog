"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/profile";
import { saveProfile } from "./actions";

export function ProfileForm({ profile, email, pendingEmail, currencies }: {
  profile: Profile; email: string; pendingEmail: string; currencies: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState({ text: "", error: false });
  const [sending, setSending] = useState(false);
  const [newEmail, setNewEmail] = useState(pendingEmail || email);
  const [emailStatus, setEmailStatus] = useState({ text: "", error: false });

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setProfileStatus({ text: "", error: false });
    try {
      const result = await saveProfile(data);
      setProfileStatus({ text: result.error || "Profile saved.", error: Boolean(result.error) });
      if (!result.error) router.refresh();
    } catch {
      setProfileStatus({ text: "Could not save your profile. Please try again.", error: true });
    } finally { setSaving(false); }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setEmailStatus({ text: "", error: false });
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", "/profile");
      const { data, error } = await createClient().auth.updateUser(
        { email: newEmail.trim() }, { emailRedirectTo: callback.toString() },
      );
      if (error) throw error;
      setEmailStatus({ text: data.user?.email === newEmail.trim()
        ? "Email updated."
        : "Check your inbox to confirm the change. You may need to confirm links sent to both your current and new email addresses.", error: false });
      router.refresh();
    } catch (error) {
      setEmailStatus({ text: error instanceof Error ? error.message : "Could not change your email. Please try again.", error: true });
    } finally { setSending(false); }
  }

  return (
    <div className="profile-sections">
      <section className="card">
        <h2 className="profile-heading">Personal details</h2>
        <form className="form-grid" onSubmit={submitProfile}>
          <label className="field span-2">Display name
            <input name="display_name" defaultValue={profile.display_name} autoComplete="name" maxLength={80} placeholder="What should we call you?" />
          </label>
          <label className="field">Home city
            <input name="home_city" defaultValue={profile.home_city} autoComplete="address-level2" maxLength={100} placeholder="Miami" />
          </label>
          <label className="field">Home country
            <input name="home_country" defaultValue={profile.home_country} autoComplete="country-name" maxLength={100} placeholder="United States" />
          </label>
          <label className="field span-2">Default currency
            <select name="preferred_currency" defaultValue={profile.preferred_currency}>
              {currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
            </select>
            <span className="profile-help">Used for new trips. Existing trips keep their currency.</span>
          </label>
          <div className="span-2">
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
            {profileStatus.text && <p role={profileStatus.error ? "alert" : "status"} className={`auth-message ${profileStatus.error ? "auth-error" : ""}`}>{profileStatus.text}</p>}
          </div>
        </form>
      </section>
      <section className="card">
        <h2 className="profile-heading">Sign-in email</h2>
        <p className="profile-help">Current email: {email}</p>
        {pendingEmail && <p className="profile-help">Awaiting confirmation: {pendingEmail}</p>}
        <form className="form-grid" onSubmit={changeEmail}>
          <label className="field span-2">Email address
            <input type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} autoComplete="email" maxLength={254} required />
            <span className="profile-help">Your email stays the same until any required confirmations are complete.</span>
          </label>
          <div className="span-2">
            <button className="btn btn-primary" type="submit" disabled={sending || newEmail.trim().toLowerCase() === email.toLowerCase()}>{sending ? "Sending…" : "Change email"}</button>
            {emailStatus.text && <p role={emailStatus.error ? "alert" : "status"} className={`auth-message ${emailStatus.error ? "auth-error" : ""}`}>{emailStatus.text}</p>}
          </div>
        </form>
      </section>
    </div>
  );
}
