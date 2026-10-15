// Starts (or resumes) Stripe Checkout for an order's pending payment.
//
// POST { payment_id, return_url } -> { url } to redirect to, or
// { status: "succeeded" } / { status: "processing" } when there's nothing left
// to pay.
//
// The order and its payment row (amount, what was bought) were created by
// register_for_sessions. This function only turns the payment into a Checkout
// session, so the amount can't be changed from the browser.
//
// Double clicks: an open Checkout is reused. When a new one is needed, the
// database hands simultaneous callers the same expiry (begin_checkout), so
// they send Stripe identical requests under one idempotency key and get one
// session back.

import Stripe from "stripe";
import { admin, stripe } from "../_shared/clients.ts";
import { isUuid, json, readPost, requireEnv } from "../_shared/http.ts";

// Comma-separated URL prefixes Stripe may send people back to, e.g.
// "http://localhost:3000/,https://xocaid.github.io/Q4C-website/". Prevents this
// function from being used to bounce people to an arbitrary site.
const allowedReturnUrls = requireEnv("ALLOWED_RETURN_URLS")
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);

// What begin_checkout returns.
type CheckoutInfo = {
    id: string;
    order_id: string;
    status: "pending" | "succeeded" | "failed" | "refunded" | "cancelled";
    amount: number;
    currency: string;
    stripe_checkout_session_id: string | null;
    checkout_expires_at: number;
    description: string | null;
    email: string | null;
    customer_id: string | null;
};

function withParam(url: string, param: string): string {
    return `${url}${url.includes("?") ? "&" : "?"}${param}`;
}

function createSession(payment: CheckoutInfo, returnUrl: string, useKnownCustomer: boolean) {
    const customer: Stripe.Checkout.SessionCreateParams = useKnownCustomer && payment.customer_id
        ? { customer: payment.customer_id }
        // Have Stripe create a customer so the person's next checkout can reuse it.
        : { customer_email: payment.email ?? undefined, customer_creation: "always" };

    return stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
            quantity: 1,
            price_data: {
                currency: payment.currency,
                unit_amount: payment.amount,
                product_data: { name: payment.description ?? "Quilting for Community" },
            },
        }],
        ...customer,
        client_reference_id: payment.id,
        metadata: { payment_id: payment.id, order_id: payment.order_id },
        payment_intent_data: { metadata: { payment_id: payment.id, order_id: payment.order_id } },
        expires_at: payment.checkout_expires_at,
        success_url: withParam(returnUrl, "checkout=success"),
        cancel_url: withParam(returnUrl, "checkout=cancelled"),
    }, {
        // Same payment, same session being replaced, same expiry: the same request. Stripe then returns the first session instead of a second.
        idempotencyKey: [
            "checkout",
            payment.id,
            payment.stripe_checkout_session_id ?? "first",
            payment.checkout_expires_at,
            useKnownCustomer && payment.customer_id ? "customer" : "email",
        ].join(":"),
    });
}

Deno.serve(async (req) => {
    const body = await readPost(req);
    if (body instanceof Response) return body;

    const paymentId = body.payment_id;
    const returnUrl = typeof body.return_url === "string" ? body.return_url : "";
    if (!isUuid(paymentId)) {
        return json({ error: "Payment not found.", code: "PAYMENT_NOT_FOUND" }, 404);
    }
    if (!allowedReturnUrls.some((prefix) => returnUrl.startsWith(prefix))) {
        return json({ error: "Return URL not allowed.", code: "RETURN_URL_NOT_ALLOWED" }, 400);
    }

    const closed = () => json({
        error: "This payment window has closed and your spot was released. Please register again.",
        code: "PAYMENT_EXPIRED",
    }, 410);

    try {
        const { data: current, error } = await admin
            .from("payments")
            .select("status, stripe_checkout_session_id")
            .eq("id", paymentId)
            .maybeSingle();
        if (error) throw error;
        if (!current) {
            return json({ error: "Payment not found.", code: "PAYMENT_NOT_FOUND" }, 404);
        }
        if (current.status === "succeeded") {
            return json({ status: "succeeded" });
        }
        if (current.status !== "pending") {
            return closed();
        }

        // Resume an open Checkout rather than starting a second one.
        if (current.stripe_checkout_session_id) {
            const existing = await stripe.checkout.sessions.retrieve(current.stripe_checkout_session_id);
            if (existing.status === "open" && existing.url) {
                return json({ url: existing.url });
            }
            if (existing.status === "complete") {
                // Paid. The webhook hasn't landed yet.
                return json({ status: "processing" });
            }
            // expired: fall through and start a new one
        }

        // Extends the seat hold to cover a new Checkout session, and releases
        // it instead if it had already run out.
        const { data, error: beginError } = await admin.rpc("begin_checkout", { p_payment_id: paymentId });
        if (beginError) throw beginError;
        const payment = data as CheckoutInfo | null;
        if (!payment || payment.status !== "pending") {
            return closed();
        }

        let session: Stripe.Checkout.Session;
        try {
            session = await createSession(payment, returnUrl, true);
        } catch (error) {
            // The saved customer no longer exists in this Stripe account.
            const missingCustomer = error instanceof Stripe.errors.StripeInvalidRequestError
                && error.code === "resource_missing" && error.param === "customer";
            if (!missingCustomer) throw error;
            session = await createSession(payment, returnUrl, false);
        }

        // Compare-and-set as a backstop, so two requests can never leave two
        // live Checkouts that could both be paid. Saves the session if the
        // payment still has the one this request replaced, or already has this
        // one (a simultaneous request got the same session from Stripe).
        const replaced = payment.stripe_checkout_session_id;
        const { data: claimed, error: claimError } = await admin
            .from("payments")
            .update({ stripe_checkout_session_id: session.id })
            .eq("id", payment.id)
            .eq("status", "pending")
            .or(`stripe_checkout_session_id.eq.${session.id},stripe_checkout_session_id.${replaced ? `eq.${replaced}` : "is.null"}`)
            .select("id");
        if (claimError) throw claimError;

        if (!claimed || claimed.length === 0) {
            // Another request started a different Checkout first. Trying again resumes theirs.
            await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
            return json({ error: "Please try again.", code: "CHECKOUT_CONFLICT" }, 409);
        }

        return json({ url: session.url });
    } catch (error) {
        console.error("create-checkout failed", error);
        return json({ error: "We couldn't start payment. Please try again.", code: "CHECKOUT_FAILED" }, 502);
    }
});
