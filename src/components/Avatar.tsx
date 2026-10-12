"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";

export const AvatarContext = createContext<{ src: string | null; initials: string }>({ src: null, initials: "U" });

export function UserAvatar() {
  const avatar = useContext(AvatarContext);
  return <Link href="/profile" className="account-profile" aria-label="Your profile"><Avatar {...avatar} /></Link>;
}

export function Avatar({ src, className = "" }: { src: string | null; initials: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`avatar ${className}`}>
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : (
        <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        </svg>
      )}
    </span>
  );
}
