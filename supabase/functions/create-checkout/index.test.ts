import Stripe from "stripe";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeQuery, loadFunction, post } from "../_shared/test_helpers.ts";

const { stripe, admin } = vi.hoisted(() => ({
    stripe: { checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } } },
    admin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock("../_shared/clients.ts", () => ({ stripe, admin }));

const PAYMENT_ID = "11111111-2222-4333-8444-555555555555";
const RETURN_URL = "http://localhost:3000/classes/payment?payment=" + PAYMENT_ID;
const request = { payment_id: PAYMENT_ID, return_url: RETURN_URL };

// what begin_checkout returns
const checkoutInfo = {
    id: PAYMENT_ID,
    order_id: "order-1",
    status: "pending",
    amount: 3000,
    currency: "usd",
    stripe_checkout_session_id: null as string | null,
    checkout_expires_at: 1_800_000_000,
    description: "Beginner Quilting",
    email: "gwen@example.com",
    customer_id: null as string | null,
};

/** The payment row the function reads first. Null for a payment that doesn't exist. */
function paymentRow(row: { status: string; stripe_checkout_session_id: string | null } | null) {
    admin.from.mockReturnValueOnce(fakeQuery({ data: row, error: null }));
}

/**
 * Whether saving the new Checkout session on the payment wins. When it doesn't,
 * `current` is the session the payment has by then.
 */
function claim(won: boolean, current: string | null = null) {
    const query = fakeQuery({ data: won ? [{ id: PAYMENT_ID }] : [], error: null });
    admin.from.mockReturnValueOnce(query);
    if (!won) {
        admin.from.mockReturnValueOnce(fakeQuery({ data: { stripe_checkout_session_id: current }, error: null }));
    }
    return query;
}

let handler: (req: Request) => Promise<Response>;

describe("create-checkout", () => {
    beforeAll(async () => {
        handler = await loadFunction(() => import("./index.ts"), { ALLOWED_RETURN_URLS: "http://localhost:3000/, https://example.org/site/" });
    });

    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    test("answers the CORS preflight and refuses anything but a POST with a JSON body", async () => {
        const preflight = await handler(new Request("http://localhost/", { method: "OPTIONS" }));
        expect(preflight.status).toBe(200);
        expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");

        expect((await handler(new Request("http://localhost/", { method: "GET" }))).status).toBe(405);
        expect((await handler(post("not json"))).status).toBe(400);
        expect(admin.from).not.toHaveBeenCalled();
    });

    test("a payment id that isn't a UUID is not found, without asking the database", async () => {
        const response = await handler(post({ payment_id: "1 or 1=1", return_url: RETURN_URL }));
        expect(response.status).toBe(404);
        expect((await response.json()).code).toBe("PAYMENT_NOT_FOUND");
        expect(admin.from).not.toHaveBeenCalled();
    });

    test("a return URL outside the allowed list is refused", async () => {
        for (const return_url of ["https://evil.example/", "http://localhost:3000.evil.example/", undefined]) {
            const response = await handler(post({ payment_id: PAYMENT_ID, return_url }));
            expect(response.status).toBe(400);
            expect((await response.json()).code).toBe("RETURN_URL_NOT_ALLOWED");
        }
        expect(admin.from).not.toHaveBeenCalled();
    });

    test("an unknown payment is not found", async () => {
        paymentRow(null);
        const response = await handler(post(request));
        expect(response.status).toBe(404);
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test("a payment that already succeeded says so instead of charging again", async () => {
        paymentRow({ status: "succeeded", stripe_checkout_session_id: "cs_old" });
        const response = await handler(post(request));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "succeeded" });
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test("a cancelled, failed or refunded payment can't be paid", async () => {
        for (const status of ["cancelled", "failed", "refunded"]) {
            paymentRow({ status, stripe_checkout_session_id: null });
            const response = await handler(post(request));
            expect(response.status).toBe(410);
            expect((await response.json()).code).toBe("PAYMENT_EXPIRED");
        }
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test("an open Checkout is resumed rather than replaced", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: "cs_open" });
        stripe.checkout.sessions.retrieve.mockResolvedValue({ status: "open", url: "https://checkout.stripe.test/cs_open" });

        const response = await handler(post(request));
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/cs_open" });
        expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_open");
        expect(admin.rpc).not.toHaveBeenCalled();
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test("a Checkout that was paid but whose webhook hasn't landed is reported as processing", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: "cs_done" });
        stripe.checkout.sessions.retrieve.mockResolvedValue({ status: "complete", url: null });

        const response = await handler(post(request));
        expect(await response.json()).toEqual({ status: "processing" });
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test("a first Checkout is created from the database's amount and expiry, and saved on the payment", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: null });
        admin.rpc.mockResolvedValue({ data: checkoutInfo, error: null });
        stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.test/cs_new" });
        const saved = claim(true);

        const response = await handler(post(request));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/cs_new" });

        expect(admin.rpc).toHaveBeenCalledWith("begin_checkout", { p_payment_id: PAYMENT_ID });
        const [params, options] = stripe.checkout.sessions.create.mock.calls[0];
        expect(params).toMatchObject({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 3000, product_data: { name: "Beginner Quilting" } } }],
            customer_email: "gwen@example.com",
            customer_creation: "always",
            metadata: { payment_id: PAYMENT_ID, order_id: "order-1" },
            expires_at: 1_800_000_000,
            success_url: `${RETURN_URL}&checkout=success`,
            cancel_url: `${RETURN_URL}&checkout=cancelled`,
        });
        expect(options.idempotencyKey).toBe(`checkout:${PAYMENT_ID}:first:1800000000:email`);

        // saved only if the payment is still pending and has no other session
        expect(saved.update).toHaveBeenCalledWith({ stripe_checkout_session_id: "cs_new" });
        expect(saved.eq).toHaveBeenCalledWith("status", "pending");
        expect(saved.is).toHaveBeenCalledWith("stripe_checkout_session_id", null);
    });

    test("an expired Checkout is replaced, reusing the person's Stripe customer", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: "cs_expired" });
        stripe.checkout.sessions.retrieve.mockResolvedValue({ status: "expired", url: null });
        admin.rpc.mockResolvedValue({
            data: { ...checkoutInfo, stripe_checkout_session_id: "cs_expired", customer_id: "cus_123" },
            error: null,
        });
        stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.test/cs_new" });
        const saved = claim(true);

        const response = await handler(post(request));
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/cs_new" });

        const [params, options] = stripe.checkout.sessions.create.mock.calls[0];
        expect(params.customer).toBe("cus_123");
        expect(params.customer_email).toBeUndefined();
        expect(options.idempotencyKey).toBe(`checkout:${PAYMENT_ID}:cs_expired:1800000000:customer`);
        expect(saved.eq).toHaveBeenCalledWith("stripe_checkout_session_id", "cs_expired");
    });

    test("a saved customer that no longer exists in Stripe falls back to the person's email", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: null });
        admin.rpc.mockResolvedValue({ data: { ...checkoutInfo, customer_id: "cus_gone" }, error: null });
        stripe.checkout.sessions.create
            .mockRejectedValueOnce(new Stripe.errors.StripeInvalidRequestError({
                type: "invalid_request_error", code: "resource_missing", param: "customer", message: "No such customer",
            }))
            .mockResolvedValueOnce({ id: "cs_new", url: "https://checkout.stripe.test/cs_new" });
        claim(true);

        const response = await handler(post(request));
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/cs_new" });
        expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(2);
        expect(stripe.checkout.sessions.create.mock.calls[1][0]).toMatchObject({ customer_email: "gwen@example.com" });
        expect(stripe.checkout.sessions.create.mock.calls[1][0].customer).toBeUndefined();
    });

    test("a hold that ran out before Checkout could start is reported as closed", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: null });
        // begin_checkout cleaned up the lapsed hold
        admin.rpc.mockResolvedValue({ data: { ...checkoutInfo, status: "cancelled" }, error: null });

        const response = await handler(post(request));
        expect(response.status).toBe(410);
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    test("losing the race to another request closes this Checkout and asks the person to retry", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: null });
        admin.rpc.mockResolvedValue({ data: checkoutInfo, error: null });
        stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_loser", url: "https://checkout.stripe.test/cs_loser" });
        stripe.checkout.sessions.expire.mockResolvedValue({});
        claim(false, "cs_winner");

        const response = await handler(post(request));
        expect(response.status).toBe(409);
        expect((await response.json()).code).toBe("CHECKOUT_CONFLICT");
        expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_loser");
    });

    test("a simultaneous request that saved this same session first is not a conflict", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: null });
        admin.rpc.mockResolvedValue({ data: checkoutInfo, error: null });
        // same idempotency key, so Stripe handed both requests this session
        stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_shared", url: "https://checkout.stripe.test/cs_shared" });
        claim(false, "cs_shared");

        const response = await handler(post(request));
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/cs_shared" });
        expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    });

    test("a Stripe or database failure is a 502 with nothing leaked", async () => {
        paymentRow({ status: "pending", stripe_checkout_session_id: null });
        admin.rpc.mockResolvedValue({ data: checkoutInfo, error: null });
        stripe.checkout.sessions.create.mockRejectedValue(new Error("sk_test_secret is invalid"));

        const stripeDown = await handler(post(request));
        expect(stripeDown.status).toBe(502);
        expect(await stripeDown.json()).toEqual({ error: "We couldn't start payment. Please try again.", code: "CHECKOUT_FAILED" });

        admin.from.mockReturnValueOnce(fakeQuery({ data: null, error: { message: "connection refused" } }));
        expect((await handler(post(request))).status).toBe(502);
    });
});
