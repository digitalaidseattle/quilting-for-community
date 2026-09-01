import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

const serviceRoleClient = createClient(
    "http://localhost:54321",
    process.env.SUPABASE_SECRET_KEY || "undefined",
);

const TEST_PREFIX = "EVENTS_SERVICE_TEST_";

type TestEvent = { id: string };
type TestSession = { id: string; status: string };

async function createInstructorProfile(): Promise<string> {
    const { data, error } = await serviceRoleClient
        .from("profiles")
        .insert({
            email: `${TEST_PREFIX}INSTRUCTOR_${Date.now()}@example.com`,
            name: "Test Instructor",
        })
        .select("id")
        .single();

    if (error) {
        throw error;
    }

    return data.id;
}

async function createEvent(status: string): Promise<TestEvent> {
    const { data, error } = await serviceRoleClient
        .from("events")
        .insert({
            name: `${TEST_PREFIX}${Date.now()}`,
            description: "Integration test event",
            status,
        })
        .select("id")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function createSession(
    eventId: string,
    status: string,
    instructorId: string | null,
    startAt = "2026-10-01T17:00:00.000Z",
): Promise<TestSession> {
    const { data, error } = await serviceRoleClient
        .from("event_sessions")
        .insert({
            event_id: eventId,
            start_at: startAt,
            end_at: "2026-10-01T19:00:00.000Z",
            status,
            part: 1,
            instructor_id: instructorId,
        })
        .select("id, status")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function getSessionStatuses(eventId: string): Promise<string[]> {
    const { data, error } = await serviceRoleClient
        .from("event_sessions")
        .select("status")
        .eq("event_id", eventId)
        .order("start_at");

    if (error) {
        throw error;
    }

    return (data ?? []).map((row) => row.status);
}

async function getEventStatus(eventId: string): Promise<string> {
    const { data, error } = await serviceRoleClient
        .from("events")
        .select("status")
        .eq("id", eventId)
        .single();

    if (error) {
        throw error;
    }

    return data.status;
}

async function cleanupTestEvents(): Promise<void> {
    const { data: events } = await serviceRoleClient
        .from("events")
        .select("id")
        .ilike("name", `${TEST_PREFIX}%`);

    const eventIds = (events ?? []).map((event) => event.id);
    if (eventIds.length > 0) {
        await serviceRoleClient.from("event_sessions").delete().in("event_id", eventIds);
        await serviceRoleClient.from("events").delete().in("id", eventIds);
    }

    await serviceRoleClient
        .from("profiles")
        .delete()
        .ilike("email", `${TEST_PREFIX}%`);
}

describe("event cancellation cascade", () => {
    let instructorId: string;

    beforeAll(async () => {
        await cleanupTestEvents();
    });

    beforeEach(async () => {
        instructorId = await createInstructorProfile();
    });

    afterEach(async () => {
        await cleanupTestEvents();
    });

    afterAll(async () => {
        await cleanupTestEvents();
    });

    test("cancelling an event cancels all of its sessions", async () => {
        const event = await createEvent("published");
        await createSession(event.id, "published", instructorId, "2026-10-01T17:00:00.000Z");
        await createSession(event.id, "draft", null, "2026-10-02T17:00:00.000Z");

        const { error } = await serviceRoleClient
            .from("events")
            .update({ status: "cancelled" })
            .eq("id", event.id);

        expect(error).toBeNull();
        expect(await getSessionStatuses(event.id)).toEqual(["cancelled", "cancelled"]);
    });

    test("cancelling one session does not cancel the parent event", async () => {
        const event = await createEvent("published");
        const published = await createSession(event.id, "published", instructorId, "2026-10-01T17:00:00.000Z");
        await createSession(event.id, "draft", null, "2026-10-02T17:00:00.000Z");

        const { error } = await serviceRoleClient
            .from("event_sessions")
            .update({ status: "cancelled" })
            .eq("id", published.id);

        expect(error).toBeNull();
        expect(await getEventStatus(event.id)).toBe("published");
        expect(await getSessionStatuses(event.id)).toEqual(["cancelled", "draft"]);
    });
});
