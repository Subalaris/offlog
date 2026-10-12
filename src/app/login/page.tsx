import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { safeAuthDestination } from "@/lib/authRedirect";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm next={safeAuthDestination(params.next)} initialError={params.error === "email_link"
    ? "This sign-in link expired, was already used, or was opened in a different browser. Request a new email below."
    : ""} />;
}
