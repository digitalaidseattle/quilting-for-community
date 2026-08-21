import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { EventSessionsService } from "./EventSessionsService";
import { EventsEntityService } from "./EventsEntityService";
import {
    Event,
    EventSession,
} from "./types";

/** Builds the denormalized search blob used for generalized event filters. */
export function buildEventSearchKey(event: Pick<Event, 'name' | 'description' | 'category'>): string {
    return `${event.name ?? ''}@${event.description ?? ''}@${event.category ?? ''}`;
}

// Handles both events and their sessions
export class EventsService {
    private static instance: EventsService;

    static getInstance() {
        if (!EventsService.instance) {
            EventsService.instance = new EventsService();
        }
        return EventsService.instance;
    }

    constructor(
        private readonly events = EventsEntityService.getInstance(),
        private readonly sessions = EventSessionsService.getInstance(),
    ) { }

    find(query: QueryModel, opts?: DataAccessOptions<Event>): Promise<PageInfo<Event>> {
        return this.events.find(query, opts);
    }

    getById(id: Identifier): Promise<Event | null> {
        return this.events.getById(id);
    }

    // Inserts or updates the event and its sessions
    async save(event: Event): Promise<Event> {
        const { event_sessions, instructor: _instructor, ...fields } = event;
        const payload = {
            ...fields,
            search_key: buildEventSearchKey(fields),
        };
        const saved = event.id
            ? await this.events.update(event.id, payload)
            : await this.events.insert(payload as Event);

        if (event_sessions) {
            const existing = event.id ? await this.sessions.getByEventId(saved.id as string) : [];
            const keptIds = new Set(event_sessions.map((session) => session.id));

            await Promise.all([
                ...existing
                    .filter((session) => !keptIds.has(session.id))
                    .map((session) => this.sessions.delete(session.id as string)),
                ...event_sessions.map((session) => this.sessions.upsert({
                    ...session,
                    event_id: saved.id as string,
                })),
            ]);
        }

        return await this.getById(saved.id as string) as Event;
    }

    async delete(id: Identifier): Promise<void> {
        return this.events.delete(id);
    }

    async cloneEvent(id: Identifier, overrides: Partial<Event> = {}): Promise<Event> {
        const source = await this.getById(id);
        if (!source) {
            throw new Error(`Event not found: ${id}`);
        }
        const {
            id: _id,
            created_at,
            updated_at,
            event_sessions,
            instructor: _instructor,
            ...rest
        } = source;
        return this.save({
            ...rest,
            ...overrides,
            template: false,
            status: overrides.status ?? 'draft',
            name: overrides.name ?? `${source.name} (copy)`,
            event_sessions: (event_sessions ?? []).map((session) => {
                const { id: _sessionId, created_at: _ca, updated_at: _ua, ...sessionRest } = session;
                return {
                    ...sessionRest,
                    id: crypto.randomUUID(),
                    status: 'draft',
                } as EventSession;
            }),
        } as Event);
    }

    sessionFromEvent(event: Event, overrides: Partial<EventSession>): EventSession {
        const start = overrides.start_at ?? new Date().toISOString();
        const duration = Math.max(1, event.duration || 60);
        const end = overrides.end_at ?? new Date(new Date(start).getTime() + duration * 60000).toISOString();

        return {
            event_id: event.id as string,
            description: overrides.description ?? '',
            start_at: start,
            end_at: end,
            max_seats: overrides.max_seats ?? null,
            status: overrides.status ?? 'draft',
        } as EventSession;
    }
}
