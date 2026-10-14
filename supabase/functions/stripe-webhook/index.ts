// Receives Stripe webhook events and records the outcome in the database.
//
// Stripe calls this directly, so JWT verification is off for this function
// (supabase/config.toml). Every request is instead verified with the
// endpoint's signing secret.
//
// Each event is handed to process_stripe_event, which records the event id and
// applies it in one database transaction. Stripe can deliver an event more than
// once: a repeat of an event that was already applied does nothing and still
// gets a 200. If applying an event fails, this answers with an error so Stripe
// redelivers it.
//
// Events to enable on the Stripe endpoint:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded
//   checkout.session.async_payment_failed
//   checkout.session.expired

import Stripe from "stripe";
import { admin, stripe } from "../_shared/clients.ts";
import { requireEnv } from "../_shared/http.ts";

const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function reply(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function idOf(value: string | { id: string } | null | undefined): string | null {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
}

// The few fields process_stripe_event needs from each kind of event.
async function eventData(event: Stripe.Event): Promise<Record<string, unknown>> {
    switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
        case "checkout.session.async_payment_failed":
        case "checkout.session.expired": {
            const session = event.data.object as Stripe.Checkout.Session;
            return {
                payment_id: session.metadata?.payment_id ?? null,
                checkout_session_id: session.id,
                payment_intent_id: idOf(session.payment_intent),
                customer_id: idOf(session.customer),
                paid: session.payment_status === "paid",
            };
        }
        default:
            return {};
    }
}

Deno.serve(async (req) => {
    if (req.method !== "POST") {
        return reply({ error: "Method not allowed" }, 405);
    }

    const signature = req.headers.get("Stripe-Signature");
    if (!signature) {
        return reply({ error: "Missing signature" }, 400);
    }

    const payload = await req.text();
    let event: Stripe.Event;
    try {
        event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret, undefined, cryptoProvider);
    } catch (error) {
        console.warn("stripe-webhook: bad signature", error);
        return reply({ error: "Invalid signature" }, 400);
    }

    try {
        const { data: outcome, error } = await admin.rpc("process_stripe_event", {
            p_event_id: event.id,
            p_event_type: event.type,
            p_data: await eventData(event),
        });
        if (error) throw error;
        if (outcome === "failed") {
            // The reason is saved on the stripe_webhook_events row.
            console.error(`stripe-webhook: could not apply ${event.type} ${event.id}`);
            return reply({ error: "Handler failed" }, 500);
        }
        return reply({ received: true, outcome });
    } catch (error) {
        console.error(`stripe-webhook: failed handling ${event.type} ${event.id}`, error);
        return reply({ error: "Handler failed" }, 500);
    }
});
