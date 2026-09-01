import { sessionsForCancelledEvent } from "./EventsService";
import { EventSession } from "./types";

function session(status: EventSession['status']): EventSession {
    return {
        id: 'session-1',
        event_id: 'event-1',
        start_at: '2026-09-01T17:00:00.000Z',
        end_at: '2026-09-01T19:00:00.000Z',
        max_seats: null,
        status,
        part: 1,
        instructor_id: null,
    };
}

describe("sessionsForCancelledEvent", () => {
    test("leaves sessions unchanged when the event is not cancelled", () => {
        const sessions = [session('published'), session('draft')];
        expect(sessionsForCancelledEvent('published', sessions)).toEqual(sessions);
    });

    test("forces every session to cancelled when the event is cancelled", () => {
        const sessions = [session('published'), session('draft'), session('cancelled')];
        const result = sessionsForCancelledEvent('cancelled', sessions);

        expect(result.every((s) => s.status === 'cancelled')).toBe(true);
        expect(result[2]).toBe(sessions[2]);
    });
});
