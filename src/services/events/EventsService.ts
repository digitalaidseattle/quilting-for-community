import { Identifier } from "@digitalaidseattle/core";
import { EventSessionsService } from "./EventSessionsService";
import { EventsEntityService } from "./EventsEntityService";
import {
    Event,
    EventSession,
} from "./types";

export class EventsService {
    private static instance: EventsService;

    static getInstance() {
        if (!EventsService.instance) {
            EventsService.instance = new EventsService();
        }
        return EventsService.instance;
    }

    constructor(
        readonly events = EventsEntityService.getInstance(),
        readonly sessions = EventSessionsService.getInstance(),
    ) { }

    async cloneEvent(id: Identifier, overrides: Partial<Event> = {}): Promise<Event> {
        const source = await this.events.getById(id);
        if (!source) {
            throw new Error(`Event not found: ${id}`);
        }
        const { id: _id, created_at, updated_at, event_sessions, ...rest } = source;
        const cloned = await this.events.insert({
            ...rest,
            ...overrides,
            template: false,
            name: overrides.name ?? `${source.name} (copy)`,
        } as Event);

        const sessions = await this.sessions.getByEventId(id as string);
        await Promise.all(sessions.map((session) => {
            const { id: sessionId, created_at: _ca, updated_at: _ua, ...sessionRest } = session;
            return this.sessions.insert({
                ...sessionRest,
                event_id: cloned.id as string,
                status: 'draft',
            } as EventSession);
        }));

        return cloned;
    }

    sessionFromEvent(event: Event, overrides: Partial<EventSession>): EventSession {
        const start = overrides.start_at ?? new Date().toISOString();
        const duration = event.duration;
        const end = overrides.end_at ?? new Date(new Date(start).getTime() + duration * 60000).toISOString();

        return {
            event_id: event.id as string,
            start_at: start,
            end_at: end,
            max_seats: overrides.max_seats ?? null,
            status: overrides.status ?? 'draft',
        } as EventSession;
    }
}
