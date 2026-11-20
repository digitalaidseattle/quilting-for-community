import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./http.ts";

export const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    httpClient: Stripe.createFetchHttpClient(),
});

// Service role: bypasses RLS. Only used for the payments bookkeeping that the
// database deliberately doesn't let anon/authenticated callers do.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the edge runtime.
export const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
});
