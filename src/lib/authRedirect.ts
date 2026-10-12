// Only allow destinations within this app, including when `next` came from an email URL.
export function safeAuthDestination(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://offlog.invalid");
    if (url.origin !== "https://offlog.invalid" || url.pathname.startsWith("//") || url.pathname === "/login" || url.pathname.startsWith("/auth/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
