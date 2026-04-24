import { createBrowserClient } from '@supabase/ssr'

// Used inside React components ('use client' files).
// Call this function each time — it is cheap and always returns
// the same singleton instance internally.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
