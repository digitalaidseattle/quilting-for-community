import { createClient, SupabaseClient } from "@supabase/supabase-js";
import process from "node:process";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

// Covers the database side of orders and paid registration (migrations
// 20260929110000_orders_schema.sql onward). Stripe itself is only reached from
// the edge functions, so the service-role functions they call
// (process_stripe_event, begin_checkout, ...) are called here directly.

const SUPABASE_URL = "http://localhost:54321";

const serviceRoleClient = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || "undefined");
const anonClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || "undefined", {
    auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_PREFIX = "PAYMENTS_TEST_";
const DAY_MS = 24 * 60 * 60 * 1000;

function futureIso(daysAhead: number, hoursOffset = 0): string {
    return new Date(Date.now() + daysAhead * DAY_MS + hoursOffset * 60 * 60 * 1000).toISOString();
}

type RpcError = { message: string; hint: string | null } | null;
const code = (error: RpcError) => error?.hint ?? null;

async function createInstructor(): Promise<string> {
    const { data, error } = await serviceRoleClient
        .from("profiles")
        .insert({ email: `${TEST_PREFIX}instructor_${Date.now()}@example.com`.toLowerCase(), name: "Test Instructor" })
        .select("id")
        .single();
    if (error) throw error;
    return data.id;
}

async function createEvent(overrides: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await serviceRoleClient
        .from("events")
        .insert({
            name: `${TEST_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            status: "published",
            max_seats: 3,
            volunteer_seat_count: 1,
            price_min: 20,
            price: 30,
            price_max: 50,
            ...overrides,
        })
        .select("id")
        .single();
    if (error) throw error;
    return data.id;
}

async function createSession(eventId: string, instructorId: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await serviceRoleClient
        .from("event_sessions")
        .insert({
            event_id: eventId,
            start_at: futureIso(7),
            end_at: futureIso(7, 2),
            status: "published",
            part: 1,
            instructor_id: instructorId,
            ...overrides,
        })
        .select("id")
        .single();
    if (error) throw error;
    return data.id;
}

function guest(name: string, email: string) {
    return { name, email: `${TEST_PREFIX}${email}`.toLowerCase() };
}

function register(
    client: SupabaseClient,
    sessionIds: string[],
    guestInfo: ReturnType<typeof guest> | null,
    amount?: number,
    requestId?: string,
) {
    return client.rpc("register_for_sessions", {
        p_session_ids: sessionIds,
        p_guest: guestInfo,
        p_waiver_accepted: true,
        p_amount: amount ?? null,
        p_request_id: requestId ?? null,
    });
}

async function seatsAvailable(eventId: string, sessionId: string): Promise<number> {
    const { data, error } = await anonClient.rpc("public_events", { p_event_id: eventId });
    if (error) throw error;
    return data[0].sessions.find((s: { id: string }) => s.id === sessionId).seats_available;
}

async function row(table: string, id: string) {
    const { data, error } = await serviceRoleClient.from(table).select("*").eq("id", id).single();
    if (error) throw error;
    return data;
}

async function registrationStatuses(orderId: string): Promise<string[]> {
    const { data, error } = await serviceRoleClient.from("event_registrations").select("status").eq("order_id", orderId);
    if (error) throw error;
    return (data ?? []).map((r) => r.status).sort();
}

let eventCounter = 0;
/** Send a Stripe-shaped event through the same entry point the webhook uses. */
async function stripeEvent(type: string, data: Record<string, unknown>, eventId?: string) {
    const id = eventId ?? `evt_test_${Date.now()}_${eventCounter++}`;
    const result = await serviceRoleClient.rpc("process_stripe_event", { p_event_id: id, p_event_type: type, p_data: data });
    return { id, outcome: result.data as string | null, error: result.error };
}

function paid(paymentId: string, intent = `pi_test_${Date.now()}_${eventCounter++}`) {
    return {
        payment_id: paymentId,
        checkout_session_id: `cs_test_${intent}`,
        payment_intent_id: intent,
        customer_id: "cus_test_123",
        paid: true,
    };
}

async function cleanup(): Promise<void> {
    const { data: events } = await serviceRoleClient.from("events").select("id").ilike("name", `${TEST_PREFIX}%`);
    const eventIds = (events ?? []).map((event) => event.id);
    if (eventIds.length > 0) {
        const { data: items } = await serviceRoleClient.from("order_items").select("order_id").in("class_id", eventIds);
        const orderIds = [...new Set((items ?? []).map((i) => i.order_id))];
        const { data: sessions } = await serviceRoleClient.from("event_sessions").select("id").in("event_id", eventIds);
        // registrations and payments point at orders
        await serviceRoleClient.from("event_registrations").delete().in("session_id", (sessions ?? []).map((s) => s.id));
        if (orderIds.length > 0) {
            await serviceRoleClient.from("payments").delete().in("order_id", orderIds);
            await serviceRoleClient.from("orders").delete().in("id", orderIds);
        }
        await serviceRoleClient.from("events").delete().in("id", eventIds);
    }
    await serviceRoleClient.from("stripe_webhook_events").delete().like("event_id", "evt_test_%");
    const { data: users } = await serviceRoleClient.auth.admin.listUsers({ perPage: 1000 });
    await Promise.all(
        (users?.users ?? [])
            .filter((user) => user.email?.toLowerCase().startsWith(TEST_PREFIX.toLowerCase()))
            .map((user) => serviceRoleClient.auth.admin.deleteUser(user.id)),
    );
    await serviceRoleClient.from("profiles").delete().ilike("email", `${TEST_PREFIX}%`);
}

let instructorId: string;

async function setupEvent(eventOverrides: Record<string, unknown> = {}) {
    instructorId = await createInstructor();
    const eventId = await createEvent(eventOverrides);
    const sessionId = await createSession(eventId, instructorId);
    return { eventId, sessionId };
}

describe("orders and paid registration", () => {
    beforeAll(cleanup);
    afterEach(cleanup);
    afterAll(cleanup);

    test("a paid amount creates an order, a class item and one pending payment that holds the seat", async () => {
        const { eventId, sessionId } = await setupEvent();
        expect(await seatsAvailable(eventId, sessionId)).toBe(2);

        const { data, error } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 35);
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data[0].status).toBe("pending");
        expect(data[0].order_id).toBeTruthy();
        expect(data[0].payment_id).toBeTruthy();

        const order = await row("orders", data[0].order_id);
        expect(order).toMatchObject({ status: "pending", amount: 3500, payment_date: null });

        const { data: items } = await serviceRoleClient.from("order_items").select("*").eq("order_id", order.id);
        expect(items).toHaveLength(1);
        expect(items![0]).toMatchObject({ class_id: eventId, amount: 3500 });

        const payment = await row("payments", data[0].payment_id);
        expect(payment).toMatchObject({
            status: "pending", type: "stripe", amount: 3500, currency: "usd", order_id: order.id,
        });
        expect(new Date(payment.expires_at).getTime()).toBeGreaterThan(Date.now() + 30 * 60 * 1000);

        expect(await seatsAvailable(eventId, sessionId)).toBe(1);
    });

    test("the amount must be inside the sliding scale", async () => {
        const { sessionId } = await setupEvent();
        const tooLow = await register(anonClient, [sessionId], guest("A", "a@example.com"), 10);
        expect(code(tooLow.error)).toBe("AMOUNT_OUT_OF_RANGE");
        const tooHigh = await register(anonClient, [sessionId], guest("A", "a@example.com"), 51);
        expect(code(tooHigh.error)).toBe("AMOUNT_OUT_OF_RANGE");
        const missing = await register(anonClient, [sessionId], guest("A", "a@example.com"));
        expect(code(missing.error)).toBe("AMOUNT_OUT_OF_RANGE");
    });

    test("$0 on a class whose minimum is $0 makes no order and confirms", async () => {
        const { sessionId } = await setupEvent({ price_min: 0, price: 25, price_max: 50 });
        const { data, error } = await register(anonClient, [sessionId], guest("Free", "free@example.com"), 0);
        expect(error).toBeNull();
        expect(data[0]).toMatchObject({ status: "confirmed", order_id: null, payment_id: null });
    });

    test("a multi-part registration makes one order and one payment covering every part", async () => {
        const { eventId, sessionId } = await setupEvent();
        const partTwo = await createSession(eventId, instructorId, { part: 2, start_at: futureIso(14), end_at: futureIso(14, 2) });

        const { data, error } = await register(anonClient, [sessionId, partTwo], guest("Pat", "pat@example.com"), 30);
        expect(error).toBeNull();
        expect(data).toHaveLength(2);
        expect(data[0].order_id).toBe(data[1].order_id);
        expect(data[0].payment_id).toBe(data[1].payment_id);
        expect((await row("orders", data[0].order_id)).amount).toBe(3000);
    });

    test("two sessions of the same part in one paid call are rejected", async () => {
        const { eventId, sessionId } = await setupEvent();
        const samePart = await createSession(eventId, instructorId, { start_at: futureIso(8), end_at: futureIso(8, 2) });
        const { error } = await register(anonClient, [sessionId, samePart], guest("Pat", "pat@example.com"), 30);
        expect(code(error)).toBe("PART_ALREADY_REGISTERED");
    });

    test("sessions from two different classes can't share one call", async () => {
        const { sessionId } = await setupEvent();
        const otherEvent = await createEvent();
        const otherSession = await createSession(otherEvent, instructorId);
        const { error } = await register(anonClient, [sessionId, otherSession], guest("Pat", "pat@example.com"), 30);
        expect(code(error)).toBe("SESSION_EVENT_MISMATCH");
    });

    test("repeating a request with the same request id returns the first order instead of a second", async () => {
        const { sessionId } = await setupEvent();
        const info = guest("Dee", "double@example.com");
        const requestId = crypto.randomUUID();

        const [first, second] = await Promise.all([
            register(anonClient, [sessionId], info, 30, requestId),
            register(anonClient, [sessionId], info, 30, requestId),
        ]);
        expect(first.error).toBeNull();
        expect(second.error).toBeNull();
        expect(second.data[0].order_id).toBe(first.data[0].order_id);
        expect(second.data[0].payment_id).toBe(first.data[0].payment_id);
        expect(second.data[0].id).toBe(first.data[0].id);

        const { data: profile } = await serviceRoleClient.from("profiles").select("id").eq("email", info.email).single();
        const { count } = await serviceRoleClient.from("orders").select("id", { count: "exact", head: true }).eq("profile_id", profile!.id);
        expect(count).toBe(1);
    });

    test("simultaneous attempts at two dates of the same part can't both get a hold", async () => {
        const { eventId, sessionId } = await setupEvent();
        const otherDate = await createSession(eventId, instructorId, { start_at: futureIso(8), end_at: futureIso(8, 2) });
        const info = guest("Rae", "race@example.com");

        const results = await Promise.all([
            register(anonClient, [sessionId], info, 30),
            register(anonClient, [otherDate], info, 30),
        ]);
        const succeeded = results.filter((r) => !r.error);
        const failed = results.filter((r) => r.error);
        expect(succeeded).toHaveLength(1);
        expect(code(failed[0].error)).toBe("PAYMENT_PENDING");
    });

    test("an unpaid hold on one part blocks a second order for another part of the same class", async () => {
        const { eventId, sessionId } = await setupEvent();
        const partTwo = await createSession(eventId, instructorId, { part: 2, start_at: futureIso(14), end_at: futureIso(14, 2) });
        const info = guest("Pat", "pat@example.com");

        const first = await register(anonClient, [sessionId], info, 30);
        expect(first.error).toBeNull();
        const second = await register(anonClient, [partTwo], info, 30);
        expect(code(second.error)).toBe("PAYMENT_PENDING");

        const { count } = await serviceRoleClient.from("order_items").select("id", { count: "exact", head: true }).eq("class_id", eventId);
        expect(count).toBe(1);
    });

    test("a session that doesn't exist is reported as unavailable", async () => {
        const { error } = await register(anonClient, [crypto.randomUUID()], guest("Pat", "pat@example.com"), 30);
        expect(code(error)).toBe("SESSION_UNAVAILABLE");
    });

    test("an order can have only one pending payment", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);
        const order = await row("orders", data[0].order_id);

        const second = await serviceRoleClient.from("payments").insert({
            order_id: order.id, amount: 3000, expires_at: futureIso(1),
        });
        expect(second.error?.code).toBe("23505");
    });

    test("a completed checkout marks the payment succeeded, the order paid, and confirms the registrations", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);
        const event = paid(data[0].payment_id, "pi_test_complete");

        const result = await stripeEvent("checkout.session.completed", event);
        expect(result.error).toBeNull();
        expect(result.outcome).toBe("processed");

        expect(await row("payments", data[0].payment_id)).toMatchObject({
            status: "succeeded",
            stripe_payment_id: "pi_test_complete",
            stripe_checkout_session_id: event.checkout_session_id,
            provider_customer_id: "cus_test_123",
        });
        const order = await row("orders", data[0].order_id);
        expect(order.status).toBe("paid");
        expect(order.payment_date).not.toBeNull();
        expect(await registrationStatuses(order.id)).toEqual(["confirmed"]);
    });

    test("the same Stripe event delivered twice is applied once", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);
        const event = paid(data[0].payment_id);

        const first = await stripeEvent("checkout.session.completed", event);
        const paidAt = (await row("payments", data[0].payment_id)).paid_at;
        const second = await stripeEvent("checkout.session.completed", event, first.id);

        expect(first.outcome).toBe("processed");
        expect(second.outcome).toBe("duplicate");
        expect((await row("payments", data[0].payment_id)).paid_at).toBe(paidAt);

        const { data: events } = await serviceRoleClient.from("stripe_webhook_events").select("status, event_type").eq("event_id", first.id);
        expect(events).toEqual([{ status: "processed", event_type: "checkout.session.completed" }]);
    });

    test("an event that can't be applied is saved as failed and succeeds when redelivered", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);

        // a payment id that isn't a UUID, so applying the event raises
        const bad = await stripeEvent("checkout.session.completed", { ...paid(data[0].payment_id), payment_id: "not-a-uuid" });
        expect(bad.error).toBeNull();
        expect(bad.outcome).toBe("failed");
        const { data: failedRow } = await serviceRoleClient.from("stripe_webhook_events").select("status, error").eq("event_id", bad.id).single();
        expect(failedRow!.status).toBe("failed");
        expect(failedRow!.error).toContain("not-a-uuid");

        // Stripe redelivers the same event id. This time it can be applied.
        const retry = await stripeEvent("checkout.session.completed", paid(data[0].payment_id), bad.id);
        expect(retry.outcome).toBe("processed");
        expect((await row("payments", data[0].payment_id)).status).toBe("succeeded");
    });

    test("a checkout this database doesn't know about is ignored, not retried", async () => {
        // e.g. another environment using the same Stripe account
        const result = await stripeEvent("checkout.session.completed", paid(crypto.randomUUID()));
        expect(result.error).toBeNull();
        expect(result.outcome).toBe("processed");
    });

    test("a completed but unpaid checkout doesn't confirm anything", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);
        const result = await stripeEvent("checkout.session.completed", { ...paid(data[0].payment_id), paid: false });
        expect(result.outcome).toBe("processed");
        expect((await row("payments", data[0].payment_id)).status).toBe("pending");
    });

    test("an expired checkout cancels the payment and order and releases the seat", async () => {
        const { eventId, sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);
        expect(await seatsAvailable(eventId, sessionId)).toBe(1);

        const result = await stripeEvent("checkout.session.expired", { payment_id: data[0].payment_id });
        expect(result.outcome).toBe("processed");
        expect((await row("payments", data[0].payment_id)).status).toBe("cancelled");
        expect((await row("orders", data[0].order_id)).status).toBe("cancelled");
        expect(await registrationStatuses(data[0].order_id)).toEqual(["cancelled"]);
        expect(await seatsAvailable(eventId, sessionId)).toBe(2);
    });

    test("an old checkout session expiring doesn't cancel a payment that moved to a newer session", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);
        await serviceRoleClient.from("payments").update({ stripe_checkout_session_id: "cs_test_new" }).eq("id", data[0].payment_id);

        await stripeEvent("checkout.session.expired", { payment_id: data[0].payment_id, checkout_session_id: "cs_test_old" });
        expect((await row("payments", data[0].payment_id)).status).toBe("pending");
    });

    test("a failed delayed payment marks the payment failed and releases the seat", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);
        const result = await stripeEvent("checkout.session.async_payment_failed", { payment_id: data[0].payment_id });
        expect(result.outcome).toBe("processed");
        expect((await row("payments", data[0].payment_id)).status).toBe("failed");
        expect(await registrationStatuses(data[0].order_id)).toEqual(["cancelled"]);
    });

    test("a lapsed hold stops counting even without a webhook, and frees the last seat", async () => {
        // one participant seat
        const { eventId, sessionId } = await setupEvent({ max_seats: 2, volunteer_seat_count: 1 });
        const { data } = await register(anonClient, [sessionId], guest("First", "first@example.com"), 30);
        const full = await register(anonClient, [sessionId], guest("Second", "second@example.com"), 30);
        expect(code(full.error)).toBe("SESSION_FULL");

        await serviceRoleClient.from("payments").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", data[0].payment_id);
        expect(await seatsAvailable(eventId, sessionId)).toBe(1);

        const second = await register(anonClient, [sessionId], guest("Second", "second@example.com"), 30);
        expect(second.error).toBeNull();
        // registering ran the lazy cleanup
        expect((await row("payments", data[0].payment_id)).status).toBe("cancelled");
        expect((await row("orders", data[0].order_id)).status).toBe("cancelled");
        expect(await registrationStatuses(data[0].order_id)).toEqual(["cancelled"]);
    });

    test("paying after the hold lapsed still registers the person", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Late", "late@example.com"), 30);
        await stripeEvent("checkout.session.expired", { payment_id: data[0].payment_id });

        await stripeEvent("checkout.session.completed", paid(data[0].payment_id));
        expect((await row("orders", data[0].order_id)).status).toBe("paid");
        expect(await registrationStatuses(data[0].order_id)).toEqual(["confirmed"]);
    });

    test("a late payment is still recorded when the person has registered for the session again", async () => {
        const { sessionId } = await setupEvent();
        const info = guest("Late", "late@example.com");
        const first = await register(anonClient, [sessionId], info, 30);
        await serviceRoleClient.from("payments").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", first.data[0].payment_id);
        const second = await register(anonClient, [sessionId], info, 30);
        expect(second.error).toBeNull();

        const result = await stripeEvent("checkout.session.completed", paid(first.data[0].payment_id));
        expect(result.outcome).toBe("processed");
        expect((await row("payments", first.data[0].payment_id)).status).toBe("succeeded");
        expect((await row("orders", first.data[0].order_id)).status).toBe("paid");
        // the newer registration keeps the seat. the old one isn't brought back beside it
        expect(await registrationStatuses(first.data[0].order_id)).toEqual(["cancelled"]);
        expect(await registrationStatuses(second.data[0].order_id)).toEqual(["pending"]);
    });

    test("retrying while a payment is in progress is blocked until it lapses", async () => {
        const { sessionId } = await setupEvent();
        const info = guest("Gwen", "gwen@example.com");
        const { data } = await register(anonClient, [sessionId], info, 30);

        const retry = await register(anonClient, [sessionId], info, 30);
        expect(code(retry.error)).toBe("PAYMENT_PENDING");
        // guests don't get the payment id back (it would expose their registration)
        expect((retry.error as unknown as { details: string }).details).toBe("");

        await serviceRoleClient.from("payments").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", data[0].payment_id);
        const afterLapse = await register(anonClient, [sessionId], info, 30);
        expect(afterLapse.error).toBeNull();
        expect(afterLapse.data[0].order_id).not.toBe(data[0].order_id);
    });

    test("participants can't cancel a pending or a paid registration online", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);

        const pending = await anonClient.rpc("cancel_registration", { p_manage_token: data[0].manage_token });
        expect(code(pending.error)).toBe("PAYMENT_PENDING");

        await stripeEvent("checkout.session.completed", paid(data[0].payment_id));
        const afterPaying = await anonClient.rpc("cancel_registration", { p_manage_token: data[0].manage_token });
        expect(code(afterPaying.error)).toBe("PAID_REGISTRATION");
    });

    test("someone who already paid for the class isn't charged for another part", async () => {
        const { eventId, sessionId } = await setupEvent();
        const partTwo = await createSession(eventId, instructorId, { part: 2, start_at: futureIso(14), end_at: futureIso(14, 2) });
        const info = guest("Pat", "pat@example.com");

        const first = await register(anonClient, [sessionId], info, 30);
        await stripeEvent("checkout.session.completed", paid(first.data[0].payment_id));

        const second = await register(anonClient, [partTwo], info, 30);
        expect(second.error).toBeNull();
        expect(second.data[0]).toMatchObject({ status: "confirmed", order_id: null, payment_id: null });
    });

    test("begin_checkout gives simultaneous callers the same Checkout expiry", async () => {
        const { sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 30);

        const [a, b] = await Promise.all([
            serviceRoleClient.rpc("begin_checkout", { p_payment_id: data[0].payment_id }),
            serviceRoleClient.rpc("begin_checkout", { p_payment_id: data[0].payment_id }),
        ]);
        expect(a.error).toBeNull();
        expect(a.data.checkout_expires_at).toBe(b.data.checkout_expires_at);
        // Stripe needs at least 30 minutes
        expect(a.data.checkout_expires_at * 1000).toBeGreaterThan(Date.now() + 30 * 60 * 1000);
        expect(a.data).toMatchObject({ status: "pending", amount: 3000, currency: "usd", customer_id: null });
        expect(a.data.description).toContain(TEST_PREFIX);

        const unknown = await serviceRoleClient.rpc("begin_checkout", { p_payment_id: crypto.randomUUID() });
        expect(unknown.data).toBeNull();
    });

    test("begin_checkout offers the person's Stripe customer from an earlier payment", async () => {
        const { eventId, sessionId } = await setupEvent();
        const info = guest("Rhea", "returning@example.com");
        const first = await register(anonClient, [sessionId], info, 30);
        await stripeEvent("checkout.session.completed", paid(first.data[0].payment_id));

        const otherEvent = await createEvent();
        const otherSession = await createSession(otherEvent, instructorId);
        const second = await register(anonClient, [otherSession], info, 30);
        const { data } = await serviceRoleClient.rpc("begin_checkout", { p_payment_id: second.data[0].payment_id });
        expect(data.customer_id).toBe("cus_test_123");
        expect(eventId).not.toBe(otherEvent);
    });

    test("payment_status returns the payment with its class and registrations, and null when unknown", async () => {
        const { eventId, sessionId } = await setupEvent();
        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), 42.5);

        const status = await anonClient.rpc("payment_status", { p_payment_id: data[0].payment_id });
        expect(status.error).toBeNull();
        expect(status.data).toMatchObject({ status: "pending", amount_cents: 4250, order_id: data[0].order_id, event: { id: eventId } });
        expect(status.data.registrations).toHaveLength(1);
        expect(status.data.registrations[0].manage_token).toBe(data[0].manage_token);
        expect(status.data.registrations[0].payment.status).toBe("pending");

        const unknown = await anonClient.rpc("payment_status", { p_payment_id: crypto.randomUUID() });
        expect(unknown.error).toBeNull();
        expect(unknown.data).toBeNull();
    });
});
