import Stripe from "stripe";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { loadFunction } from "../_shared/test_helpers.ts";

const WEBHOOK_SECRET = "whsec_test_secret";

const { admin } = vi.hoisted(() => ({ admin: { rpc: vi.fn() } }));
// A real Stripe client, so signatures are checked for real.
vi.mock("../_shared/clients.ts", async () => {
    const { default: StripeClient } = await import("stripe");
    return { stripe: new StripeClient("sk_test_not_a_real_key"), admin };
});

const signer = new Stripe("sk_test_not_a_real_key");

/** A webhook request signed the way Stripe signs them. */
async function webhook(event: { id: string; type: string; data: { object: unknown } }, secret = WEBHOOK_SECRET) {
    const payload = JSON.stringify({ object: "event", ...event });
    const signature = await signer.webhooks.generateTestHeaderStringAsync({ payload, secret });
    return new Request("http://localhost/functions/v1/stripe-webhook", {
        method: "POST",
        headers: { "Stripe-Signature": signature },
        body: payload,
    });
}

const session = {
    id: "cs_test_1",
    object: "checkout.session",
    metadata: { payment_id: "11111111-2222-4333-8444-555555555555" },
    payment_intent: "pi_test_1",
    customer: "cus_test_1",
    payment_status: "paid",
};

let handler: (req: Request) => Promise<Response>;

describe("stripe-webhook", () => {
    beforeAll(async () => {
        handler = await loadFunction(() => import("./index.ts"), { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET });
    });

    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        admin.rpc.mockResolvedValue({ data: "processed", error: null });
    });

    test("a request without a valid Stripe signature never reaches the database", async () => {
        expect((await handler(new Request("http://localhost/", { method: "GET" }))).status).toBe(405);

        const unsigned = new Request("http://localhost/", { method: "POST", body: "{}" });
        expect((await handler(unsigned)).status).toBe(400);

        const event = { id: "evt_1", type: "checkout.session.completed", data: { object: session } };
        expect((await handler(await webhook(event, "whsec_someone_elses"))).status).toBe(400);

        // signed, then the amount changed on the way
        const signed = await webhook(event);
        const tampered = new Request(signed.url, {
            method: "POST",
            headers: signed.headers,
            body: (await signed.text()).replace("cs_test_1", "cs_test_2"),
        });
        expect((await handler(tampered)).status).toBe(400);

        expect(admin.rpc).not.toHaveBeenCalled();
    });

    test("a completed checkout is handed to process_stripe_event with the fields it needs", async () => {
        const response = await handler(await webhook({ id: "evt_1", type: "checkout.session.completed", data: { object: session } }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true, outcome: "processed" });
        expect(admin.rpc).toHaveBeenCalledWith("process_stripe_event", {
            p_event_id: "evt_1",
            p_event_type: "checkout.session.completed",
            p_data: {
                payment_id: "11111111-2222-4333-8444-555555555555",
                checkout_session_id: "cs_test_1",
                payment_intent_id: "pi_test_1",
                customer_id: "cus_test_1",
                paid: true,
            },
        });
    });

    test("an expired, unpaid checkout with no customer is passed on as unpaid", async () => {
        const expired = { ...session, payment_intent: null, customer: null, payment_status: "unpaid" };
        await handler(await webhook({ id: "evt_2", type: "checkout.session.expired", data: { object: expired } }));
        expect(admin.rpc.mock.calls[0][1]).toMatchObject({
            p_event_type: "checkout.session.expired",
            p_data: { checkout_session_id: "cs_test_1", payment_intent_id: null, customer_id: null, paid: false },
        });
    });

    test("a checkout this system didn't start has no payment id", async () => {
        const foreign = { ...session, metadata: {} };
        const response = await handler(await webhook({ id: "evt_3", type: "checkout.session.completed", data: { object: foreign } }));
        expect(response.status).toBe(200);
        expect(admin.rpc.mock.calls[0][1].p_data.payment_id).toBeNull();
    });

    test("an event type this system doesn't act on is still recorded and acknowledged", async () => {
        const response = await handler(await webhook({ id: "evt_5", type: "customer.created", data: { object: { id: "cus_1" } } }));
        expect(response.status).toBe(200);
        expect(admin.rpc).toHaveBeenCalledWith("process_stripe_event", { p_event_id: "evt_5", p_event_type: "customer.created", p_data: {} });
    });

    test("a repeat delivery gets a 200 so Stripe stops sending it", async () => {
        admin.rpc.mockResolvedValue({ data: "duplicate", error: null });
        const response = await handler(await webhook({ id: "evt_1", type: "checkout.session.completed", data: { object: session } }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true, outcome: "duplicate" });
    });

    test("an event that couldn't be applied gets a 500 so Stripe redelivers it", async () => {
        const event = { id: "evt_6", type: "checkout.session.completed", data: { object: session } };

        admin.rpc.mockResolvedValue({ data: "failed", error: null });
        expect((await handler(await webhook(event))).status).toBe(500);

        admin.rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });
        expect((await handler(await webhook(event))).status).toBe(500);
    });
});
