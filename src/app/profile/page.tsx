import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { currencies, readProfile } from "@/lib/profile";
import { ProfileForm } from "./ProfileForm";
import { ProfilePhoto } from "./ProfilePhoto";
import { profilePhotoPath } from "@/lib/profilePhoto";

import { CalendarConnection } from "./CalendarConnection";
import { getCalendarSubscription } from "@/lib/calendarSubscription";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const calendarSubscription = await getCalendarSubscription(user.id);
  return (
    <>
      <header className="topbar">
        <div className="greeting">
          <h1>Your profile</h1>
          <p>Manage your details and travel preferences.</p>
        </div>
      </header>
      <div className="profile-sections">
        <ProfilePhoto path={profilePhotoPath(user.user_metadata, user.id)} initials={(readProfile(user.user_metadata).display_name || user.email || "U").slice(0, 2).toUpperCase()} />
        <CalendarConnection initialState={calendarSubscription} />
        <ProfileForm profile={readProfile(user.user_metadata)} email={user.email ?? ""}
          pendingEmail={user.new_email ?? ""} currencies={currencies} />
      </div>
    </>
  );
}
