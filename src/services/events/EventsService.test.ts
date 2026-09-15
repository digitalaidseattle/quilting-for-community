import {
    buildEventSearchKey,
    EventsService,
    normalizeSessionParts,
    sessionsForCancelledEvent,
} from "./EventsService";
import { EventsEntityService } from "./EventsEntityService";
import { EventSessionsService } from "./EventSessionsService";
import { Event, EventSession } from "./types";

function session(overrides: Partial<EventSession> = {}): EventSession {
    return {
        id: overrides.id ?? 'session-1',
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

function baseEvent(overrides: Partial<Event> = {}): Event {
    return {
        id: 'event-1',
        name: 'Intro to Quilting',
        description: 'Basics',
        notes: '',
        category: 'beginner',
        duration: 120,
        max_seats: 12,
        volunteer_seat_count: 2,
        price_min: 0,
        price: 25,
        price_max: 50,
        template: false,
        status: 'draft',
        search_key: '',
        event_sessions: [],
        ...overrides,
    } as Event;
}

describe("buildEventSearchKey", () => {
    test("joins name, description, and category with @", () => {
        expect(buildEventSearchKey({
            name: 'Quilting',
            description: 'Basics',
            category: 'beginner',
        })).toBe('Quilting@Basics@beginner');
    });
});

describe("normalizeSessionParts", () => {
    test("renumbers parts to stay contiguous from 1", () => {
        const sessions = [
            session({ id: 'a', part: 1, start_at: '2026-09-01T17:00:00.000Z' }),
            session({ id: 'b', part: 3, start_at: '2026-09-08T17:00:00.000Z' }),
        ];

        expect(normalizeSessionParts(sessions).map((s) => s.part)).toEqual([1, 2]);
    });

    test("sorts by part, then start time", () => {
        const sessions = [
            session({ id: 'b', part: 2, start_at: '2026-09-08T17:00:00.000Z' }),
            session({ id: 'a', part: 1, start_at: '2026-09-15T17:00:00.000Z' }),
            session({ id: 'c', part: 1, start_at: '2026-09-01T17:00:00.000Z' }),
        ];

        expect(normalizeSessionParts(sessions).map((s) => s.id)).toEqual(['c', 'a', 'b']);
    });
});

describe("sessionsForCancelledEvent", () => {
    test("leaves sessions unchanged when the event is not cancelled", () => {
        const sessions = [session({ status: 'published' }), session({ status: 'draft' })];
        expect(sessionsForCancelledEvent('published', sessions)).toEqual(sessions);
    });

    test("forces every session to cancelled when the event is cancelled", () => {
        const sessions = [
            session({ status: 'published' }),
            session({ status: 'draft' }),
            session({ status: 'cancelled' }),
        ];
        const result = sessionsForCancelledEvent('cancelled', sessions);

        expect(result.every((s) => s.status === 'cancelled')).toBe(true);
        expect(result[2]).toBe(sessions[2]);
    });
});

describe("EventsService.save", () => {
    const mockEvents = {
        insert: vi.fn(),
        update: vi.fn(),
        getById: vi.fn(),
    } as unknown as EventsEntityService;

    const mockSessions = {
        getByEventId: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    } as unknown as EventSessionsService;

    let service: EventsService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new EventsService(mockEvents, mockSessions);
        vi.mocked(mockEvents.update).mockResolvedValue(baseEvent());
        vi.mocked(mockEvents.getById).mockResolvedValue(baseEvent());
        vi.mocked(mockSessions.getByEventId).mockResolvedValue([]);
        vi.mocked(mockSessions.upsert).mockResolvedValue(session());
    });

    test("cancels every session in the payload when the event is cancelled", async () => {
        const event = baseEvent({
            status: 'cancelled',
            event_sessions: [
                session({ id: 's1', status: 'published' }),
                session({ id: 's2', status: 'draft' }),
            ],
        });

        await service.save(event);

        expect(mockSessions.upsert).toHaveBeenCalledTimes(2);
        expect(mockSessions.upsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 's1',
            status: 'cancelled',
        }));
        expect(mockSessions.upsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 's2',
            status: 'cancelled',
        }));
    });

    test("cancels existing sessions when the event is cancelled without a session payload", async () => {
        vi.mocked(mockSessions.getByEventId).mockResolvedValue([
            session({ id: 's1', status: 'published' }),
            session({ id: 's2', status: 'cancelled' }),
        ]);

        await service.save(baseEvent({ status: 'cancelled', event_sessions: undefined }));

        expect(mockSessions.update).toHaveBeenCalledTimes(1);
        expect(mockSessions.update).toHaveBeenCalledWith('s1', { status: 'cancelled' });
    });

    test("does not cancel sessions when the event stays published", async () => {
        const event = baseEvent({
            status: 'published',
            event_sessions: [session({ id: 's1', status: 'published', instructor_id: 'inst-1' })],
        });

        await service.save(event);

        expect(mockSessions.upsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 's1',
            status: 'published',
        }));
        expect(mockSessions.update).not.toHaveBeenCalled();
    });

    test("defaults part and instructor_id on a new session", () => {
        const draft = service.sessionFromEvent(baseEvent(), {
            start_at: '2026-09-01T17:00:00.000Z',
            end_at: '2026-09-01T19:00:00.000Z',
        });

        expect(draft.part).toBe(1);
        expect(draft.instructor_id).toBeNull();
        expect(draft.status).toBe('draft');
    });
});
