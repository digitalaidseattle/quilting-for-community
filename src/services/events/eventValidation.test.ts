import { EventsDao } from "./EventsDao";
import { validateEvent } from "./eventValidation";
import { Event, EventSession } from "./types";

function baseEvent(overrides: Partial<Event> = {}): Event {
    return {
        ...EventsDao.empty(),
        name: 'Intro to Quilting',
        status: 'draft',
        event_sessions: [],
        ...overrides,
    };
}

function session(overrides: Partial<EventSession> = {}): EventSession {
    return {
        id: 'session-1',
        event_id: 'event-1',
        start_at: '2026-09-01T17:00:00.000Z',
        end_at: '2026-09-01T19:00:00.000Z',
        max_seats: null,
        status: 'draft',
        part: 1,
        instructor_id: null,
        ...overrides,
    };
}

describe("validateEvent", () => {
    test("requires only a title for a draft event", () => {
        expect(validateEvent(baseEvent({ name: 'New class' }))).toEqual({});
    });

    test("rejects an empty title", () => {
        expect(validateEvent(baseEvent({ name: '   ' }))).toEqual({
            name: 'Title is required',
        });
    });

    test("requires at least one session before publishing a non-template event", () => {
        expect(validateEvent(baseEvent({ status: 'published' }))).toEqual({
            sessions: 'Add at least one session before publishing',
        });
    });

    test("allows a published template without sessions", () => {
        expect(validateEvent(baseEvent({
            template: true,
            status: 'published',
            event_sessions: [],
        }))).toEqual({});
    });

    test("requires an instructor before publishing a session", () => {
        expect(validateEvent(baseEvent({
            event_sessions: [session({ status: 'published' })],
        }))).toEqual({
            sessions: 'Assign an instructor before publishing a session',
        });
    });

    test("allows a published session when an instructor is assigned", () => {
        expect(validateEvent(baseEvent({
            status: 'published',
            event_sessions: [
                session({ status: 'published', instructor_id: 'instructor-1' }),
            ],
        }))).toEqual({});
    });

    test("does not require an instructor on draft sessions", () => {
        expect(validateEvent(baseEvent({
            event_sessions: [session({ status: 'draft' })],
        }))).toEqual({});
    });
});
