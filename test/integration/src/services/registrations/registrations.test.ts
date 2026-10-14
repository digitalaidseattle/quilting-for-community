import { createClient, SupabaseClient } from "@supabase/supabase-js";
import process from "node:process";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

const SUPABASE_URL = "http://localhost:54321";

const serviceRoleClient = createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY || "undefined",
);

const anonClient = createClient(
    SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || "undefined",
    { auth: { persistSession: false, autoRefreshToken: false } },
);

const TEST_PREFIX = "REGISTRATIONS_TEST_";
const TEST_PASSWORD = "password123";

const DAY_MS = 24 * 60 * 60 * 1000;

function futureIso(daysAhead: number, hoursOffset = 0): string {
    return new Date(Date.now() + daysAhead * DAY_MS + hoursOffset * 60 * 60 * 1000).toISOString();
}

type RpcError = { message: string; hint: string | null } | null;

function code(error: RpcError): string | null {
    return error?.hint ?? null;
}

async function createInstructorProfile(): Promise<string> {
    const { data, error } = await serviceRoleClient
        .from("profiles")
        .insert({
            email: `${TEST_PREFIX}INSTRUCTOR_${Date.now()}@example.com`.toLowerCase(),
            name: "Test Instructor",
        })
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
            description: "Integration test event",
            status: "published",
            max_seats: 3,
            volunteer_seat_count: 1,
            ...overrides,
        })
        .select("id")
        .single();
    if (error) throw error;
    return data.id;
}

async function createSession(
    eventId: string,
    instructorId: string | null,
    overrides: Record<string, unknown> = {},
): Promise<string> {
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

async function createAuthUser(email: string, name: string): Promise<{ id: string; client: SupabaseClient }> {
    const { data, error } = await serviceRoleClient.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { name },
    });
    if (error) throw error;

    const client = createClient(
        SUPABASE_URL,
        process.env.VITE_SUPABASE_ANON_KEY || "undefined",
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signIn = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (signIn.error) throw signIn.error;

    return { id: data.user.id, client };
}

function guest(name: string, email?: string, phone?: string) {
    return {
        name,
        email: email ? `${TEST_PREFIX}${email}`.toLowerCase() : undefined,
        phone,
    };
}

async function register(
    client: SupabaseClient,
    sessionIds: string[],
    guestInfo: ReturnType<typeof guest> | null = null,
    waiverAccepted = true,
) {
    return client.rpc("register_for_sessions", {
        p_session_ids: sessionIds,
        p_guest: guestInfo,
        p_waiver_accepted: waiverAccepted,
    });
}

async function cleanup(): Promise<void> {
    const { data: events } = await serviceRoleClient
        .from("events")
        .select("id")
        .ilike("name", `${TEST_PREFIX}%`);
    const eventIds = (events ?? []).map((event) => event.id);
    if (eventIds.length > 0) {
        // registrations cascade from sessions, sessions cascade from events
        await serviceRoleClient.from("events").delete().in("id", eventIds);
    }

    const { data: users } = await serviceRoleClient.auth.admin.listUsers({ perPage: 1000 });
    await Promise.all(
        (users?.users ?? [])
            .filter((user) => user.email?.toLowerCase().startsWith(TEST_PREFIX.toLowerCase()))
            .map((user) => serviceRoleClient.auth.admin.deleteUser(user.id)),
    );

    await serviceRoleClient
        .from("profiles")
        .delete()
        .ilike("email", `${TEST_PREFIX}%`);
}

describe("public_events", () => {
    beforeAll(cleanup);
    afterEach(cleanup);
    afterAll(cleanup);

    test("anon sees published events with upcoming published sessions only", async () => {
        const instructorId = await createInstructorProfile();
        const published = await createEvent();
        const publishedSession = await createSession(published, instructorId);
        await createSession(published, null, { status: "draft", part: 2 });
        await createSession(published, instructorId, { start_at: futureIso(-3), end_at: futureIso(-3, 2) });

        const draft = await createEvent({ status: "draft" });
        await createSession(draft, instructorId);

        const { data, error } = await anonClient.rpc("public_events");
        expect(error).toBeNull();

        const names = (data as { id: string }[]).map((event) => event.id);
        expect(names).toContain(published);
        expect(names).not.toContain(draft);

        const event = (data as { id: string; sessions: { id: string; seats_available: number; instructor_name: string }[] }[])
            .find((item) => item.id === published)!;
        expect(event.sessions.map((session) => session.id)).toEqual([publishedSession]);
        // max_seats 3 minus 1 volunteer seat
        expect(event.sessions[0].seats_available).toBe(2);
        expect(event.sessions[0].instructor_name).toBe("Test Instructor");
    });

    test("anon cannot read base tables directly", async () => {
        const events = await anonClient.from("events").select("id");
        const sessions = await anonClient.from("event_sessions").select("id");
        const profiles = await anonClient.from("profiles").select("id");
        const registrations = await anonClient.from("event_registrations").select("id");

        expect(events.error).not.toBeNull();
        expect(sessions.error).not.toBeNull();
        expect(profiles.error).not.toBeNull();
        expect(registrations.error).not.toBeNull();
    });
});

describe("register_for_sessions (guest)", () => {
    let instructorId: string;
    let eventId: string;
    let sessionId: string;

    beforeAll(cleanup);
    afterEach(cleanup);
    afterAll(cleanup);

    async function setup() {
        instructorId = await createInstructorProfile();
        eventId = await createEvent();
        sessionId = await createSession(eventId, instructorId);
    }

    test("creates a login-less profile and reuses it next time", async () => {
        await setup();
        const info = guest("Gwen Guest", "gwen@example.com", "555-0100");

        const first = await register(anonClient, [sessionId], info);
        expect(first.error).toBeNull();
        expect(first.data).toHaveLength(1);
        expect(first.data[0].status).toBe("confirmed");
        expect(first.data[0].manage_token).toBeTruthy();

        const { data: profiles } = await serviceRoleClient
            .from("profiles")
            .select("id, auth_id, name, first_name, last_name, phone, waiver_accepted")
            .eq("email", info.email!);
        expect(profiles).toHaveLength(1);
        expect(profiles![0]).toMatchObject({
            auth_id: null,
            name: "Gwen Guest",
            first_name: "Gwen",
            last_name: "Guest",
            phone: "555-0100",
            waiver_accepted: true,
        });

        const otherSession = await createSession(eventId, instructorId, { part: 2, start_at: futureIso(14), end_at: futureIso(14, 2) });
        const second = await register(anonClient, [otherSession], guest("Gwen G", "gwen@example.com"));
        expect(second.error).toBeNull();

        const { count } = await serviceRoleClient
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("email", info.email!);
        expect(count).toBe(1);
    });

    test("rejects a guest email that belongs to an account", async () => {
        await setup();
        const email = `${TEST_PREFIX}member@example.com`.toLowerCase();
        await createAuthUser(email, "Mo Member");

        const { error } = await register(anonClient, [sessionId], guest("Mo", "member@example.com"));
        expect(code(error)).toBe("ACCOUNT_EXISTS");
    });

    test("requires the waiver and guest contact info", async () => {
        await setup();
        const noWaiver = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"), false);
        expect(code(noWaiver.error)).toBe("WAIVER_REQUIRED");

        const noContact = await register(anonClient, [sessionId], { name: "Gwen", email: undefined, phone: undefined });
        expect(code(noContact.error)).toBe("GUEST_INFO_REQUIRED");

        const noName = await register(anonClient, [sessionId], { name: "", email: `${TEST_PREFIX}x@example.com`, phone: undefined });
        expect(code(noName.error)).toBe("GUEST_INFO_REQUIRED");
    });

    test("phone-only guests are supported", async () => {
        await setup();
        const { data, error } = await register(anonClient, [sessionId], guest("Phone Only", undefined, "555-0199"));
        expect(error).toBeNull();
        expect(data).toHaveLength(1);

        // cleanup() matches on email; remove this profile explicitly
        await serviceRoleClient.from("profiles").delete().eq("phone", "555-0199").is("auth_id", null);
    });

    test("rejects duplicate session and duplicate part registrations", async () => {
        await setup();
        const info = guest("Gwen", "gwen@example.com");
        const altPartOne = await createSession(eventId, instructorId, { start_at: futureIso(8), end_at: futureIso(8, 2) });

        expect((await register(anonClient, [sessionId], info)).error).toBeNull();

        const duplicate = await register(anonClient, [sessionId], info);
        expect(code(duplicate.error)).toBe("ALREADY_REGISTERED");

        const samePart = await register(anonClient, [altPartOne], info);
        expect(code(samePart.error)).toBe("PART_ALREADY_REGISTERED");
    });

    test("multi-part: one session per part in a single call, atomically", async () => {
        await setup();
        const partTwo = await createSession(eventId, instructorId, { part: 2, start_at: futureIso(14), end_at: futureIso(14, 2) });
        const partTwoAlt = await createSession(eventId, instructorId, { part: 2, start_at: futureIso(15), end_at: futureIso(15, 2) });
        const info = guest("Gwen", "gwen@example.com");

        const bothPartTwo = await register(anonClient, [partTwo, partTwoAlt], info);
        expect(code(bothPartTwo.error)).toBe("PART_ALREADY_REGISTERED");

        const { count: none } = await serviceRoleClient
            .from("event_registrations")
            .select("id", { count: "exact", head: true })
            .in("session_id", [sessionId, partTwo, partTwoAlt]);
        expect(none).toBe(0);

        const { data, error } = await register(anonClient, [sessionId, partTwo], info);
        expect(error).toBeNull();
        expect(data).toHaveLength(2);
    });

    test("enforces capacity and hides unavailable sessions", async () => {
        await setup();
        // event max_seats 3, volunteer 1 => 2 participant seats
        expect((await register(anonClient, [sessionId], guest("A", "a@example.com"))).error).toBeNull();
        expect((await register(anonClient, [sessionId], guest("B", "b@example.com"))).error).toBeNull();

        const full = await register(anonClient, [sessionId], guest("C", "c@example.com"));
        expect(code(full.error)).toBe("SESSION_FULL");

        const { data } = await anonClient.rpc("public_events", { p_event_id: eventId });
        expect(data[0].sessions[0].seats_available).toBe(0);

        const draftSession = await createSession(eventId, null, { status: "draft", part: 2 });
        const draft = await register(anonClient, [draftSession], guest("C", "c@example.com"));
        expect(code(draft.error)).toBe("SESSION_UNAVAILABLE");

        const pastSession = await createSession(eventId, instructorId, { part: 3, start_at: futureIso(-1), end_at: futureIso(-1, 2) });
        const past = await register(anonClient, [pastSession], guest("C", "c@example.com"));
        expect(code(past.error)).toBe("SESSION_UNAVAILABLE");
    });
});

describe("cancel_registration and registration_by_token", () => {
    beforeAll(cleanup);
    afterEach(cleanup);
    afterAll(cleanup);

    test("guest can look up and cancel by manage token", async () => {
        const instructorId = await createInstructorProfile();
        const eventId = await createEvent();
        const sessionId = await createSession(eventId, instructorId);

        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"));
        const token = data[0].manage_token as string;

        const lookup = await anonClient.rpc("registration_by_token", { p_manage_token: token });
        expect(lookup.error).toBeNull();
        expect(lookup.data.status).toBe("confirmed");
        expect(lookup.data.session.id).toBe(sessionId);
        expect(lookup.data.event.id).toBe(eventId);
        expect(lookup.data.registrant.name).toBe("Gwen");

        const cancelled = await anonClient.rpc("cancel_registration", { p_manage_token: token });
        expect(cancelled.error).toBeNull();
        expect(cancelled.data.status).toBe("cancelled");

        const unknown = await anonClient.rpc("registration_by_token", { p_manage_token: crypto.randomUUID() });
        expect(unknown.error).toBeNull();
        expect(unknown.data).toBeNull();

        // can register again after cancelling
        const again = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"));
        expect(again.error).toBeNull();
    });

    test("cannot cancel within 48 hours of the session", async () => {
        const instructorId = await createInstructorProfile();
        const eventId = await createEvent();
        const soon = await createSession(eventId, instructorId, { start_at: futureIso(1), end_at: futureIso(1, 2) });

        const { data } = await register(anonClient, [soon], guest("Gwen", "gwen@example.com"));
        const { error } = await anonClient.rpc("cancel_registration", { p_manage_token: data[0].manage_token });
        expect(code(error)).toBe("CANCELLATION_WINDOW_CLOSED");
    });

    test("anon cannot cancel by id", async () => {
        const instructorId = await createInstructorProfile();
        const eventId = await createEvent();
        const sessionId = await createSession(eventId, instructorId);

        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"));
        const { error } = await anonClient.rpc("cancel_registration", { p_registration_id: data[0].id });
        expect(code(error)).toBe("NOT_ALLOWED");
    });
});

describe("signed-in users", () => {
    beforeAll(cleanup);
    afterEach(cleanup);
    afterAll(cleanup);

    test("register with their profile, see it in my_registrations, and cancel it", async () => {
        const instructorId = await createInstructorProfile();
        const eventId = await createEvent();
        const sessionId = await createSession(eventId, instructorId);
        const email = `${TEST_PREFIX}user@example.com`.toLowerCase();
        const { id: authId, client } = await createAuthUser(email, "Uma User");

        const { data, error } = await register(client, [sessionId]);
        expect(error).toBeNull();
        expect(data).toHaveLength(1);

        const { data: profile } = await serviceRoleClient
            .from("profiles")
            .select("id, waiver_accepted")
            .eq("auth_id", authId)
            .single();
        expect(profile!.waiver_accepted).toBe(true);

        const mine = await client.rpc("my_registrations");
        expect(mine.error).toBeNull();
        expect(mine.data).toHaveLength(1);
        expect(mine.data[0].session.id).toBe(sessionId);
        expect(mine.data[0].registrant.name).toBe("Uma User");

        // RLS lets the user read their own row directly, and nobody else's
        const own = await client.from("event_registrations").select("id");
        expect(own.error).toBeNull();
        expect(own.data).toHaveLength(1);

        const cancelled = await client.rpc("cancel_registration", { p_registration_id: data[0].id });
        expect(cancelled.error).toBeNull();
        expect(cancelled.data.status).toBe("cancelled");

        const anonMine = await anonClient.rpc("my_registrations");
        expect(anonMine.error).not.toBeNull();
    });

    test("a guest profile is linked when that email creates an account", async () => {
        const instructorId = await createInstructorProfile();
        const eventId = await createEvent();
        const sessionId = await createSession(eventId, instructorId);
        const info = guest("Gwen Guest", "link@example.com", "555-0123");

        const { data } = await register(anonClient, [sessionId], info);
        const { data: before } = await serviceRoleClient
            .from("profiles")
            .select("id")
            .eq("email", info.email!)
            .single();

        const { id: authId, client } = await createAuthUser(info.email!, "Gwen Account");

        const { data: profiles } = await serviceRoleClient
            .from("profiles")
            .select("id, auth_id, name, phone, roles")
            .eq("email", info.email!);
        expect(profiles).toHaveLength(1);
        expect(profiles![0]).toMatchObject({ id: before!.id, auth_id: authId, name: "Gwen Guest", phone: "555-0123" });
        expect(profiles![0].roles).toEqual(["participant"]);

        const mine = await client.rpc("my_registrations");
        expect(mine.error).toBeNull();
        expect(mine.data.map((r: { id: string }) => r.id)).toEqual([data[0].id]);
    });

    test("cannot cancel someone else's registration by id", async () => {
        const instructorId = await createInstructorProfile();
        const eventId = await createEvent();
        const sessionId = await createSession(eventId, instructorId);

        const { data } = await register(anonClient, [sessionId], guest("Gwen", "gwen@example.com"));
        const { client } = await createAuthUser(`${TEST_PREFIX}other@example.com`.toLowerCase(), "Other");

        const { error } = await client.rpc("cancel_registration", { p_registration_id: data[0].id });
        expect(code(error)).toBe("NOT_ALLOWED");
    });
});
