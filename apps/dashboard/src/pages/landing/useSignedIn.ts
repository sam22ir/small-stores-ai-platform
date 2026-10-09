import { useEffect, useState } from "react";

// Supabase keeps a session under "sb-<project>-auth-token" in localStorage.
function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  } catch {
    return false;
  }
}

// "Go to inbox" on the landing. Anonymous visitors never download the Supabase client: it loads
// only when this browser already holds a session, and after the first paint.
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!hasStoredSession()) return;
    let live = true;
    import("../../lib/supabase")
      .then(async ({ supabase, configured }) => {
        if (!configured) return;
        const { data } = await supabase.auth.getSession();
        if (live && data.session) setSignedIn(true);
      })
      .catch(() => { /* stays signed out */ });
    return () => { live = false; };
  }, []);

  return signedIn;
}
