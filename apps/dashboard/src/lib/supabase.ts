import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

// The publishable key is public by design: RLS and table privileges protect the data.
export const supabase = createClient<Database>(
  url ?? "http://localhost:0",
  key ?? "missing",
  { auth: { persistSession: true, autoRefreshToken: true } },
);
