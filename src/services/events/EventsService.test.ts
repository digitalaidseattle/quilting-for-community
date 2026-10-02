import { withSortedSessions } from "./EventsService";
import { Event, EventSession } from "./types";

function session(id: string, start_at: string): EventSession {
    return {
        id,
        event_id: "event-1",
        description: "",
        start_at,
        end_at: start_at,
        max_seats: null,
        status: "draft",
    } as EventSession;
}

describe("withSortedSessions", () => {
    test("sorts sessions by start_at", () => {
        const event = {
            name: "Intro",
            event_sessions: [
                session("later", "2026-09-10T17:00:00.000Z"),
                session("earlier", "2026-09-03T17:00:00.000Z"),
            ],
        } as Event;

        expect(withSortedSessions(event).event_sessions?.map((s) => s.id)).toEqual([
            "earlier",
            "later",
        ]);
    });

    test("leaves events without sessions unchanged", () => {
        const event = { name: "Intro" } as Event;
        expect(withSortedSessions(event).event_sessions).toBeUndefined();
    });
});
