import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { EventSessionsService } from "./EventSessionsService";
import { EventsEntityService } from "./EventsEntityService";
import {
    Event,
    EventSession,
} from "./types";

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
        const { event_sessions, ...fields } = event;
        const saved = event.id
            ? await this.events.update(event.id, fields)
            : await this.events.insert(fields as Event);

        if (event_sessions) {
            const existing = event.id ? await this.sessions.getByEventId(saved.id as string) : [];
            const keptIds = new Set(event_sessions.map((session) => session.id));
            const named = this.withDefaultNames(saved, event_sessions);

            await Promise.all([
                ...existing
                    .filter((session) => !keptIds.has(session.id))
                    .map((session) => this.sessions.delete(session.id as string)),
                ...named.map((session) => this.sessions.upsert({
                    ...session,
                    event_id: saved.id as string,
                })),
            ]);
        }

        return await this.getById(saved.id as string) as Event;
    }

    // Blank session names are materialized at save time: a lone session takes
    // the event's name; parts of a multi-session class get "(Part n)" by date.
    private withDefaultNames(event: Event, sessions: EventSession[]): EventSession[] {
        if (sessions.length === 1) {
            return sessions.map((session) => ({
                ...session,
                name: session.name || event.name,
            }));
        }
        const ordered = [...sessions].sort((a, b) => a.start_at.localeCompare(b.start_at));
        return sessions.map((session) => ({
            ...session,
            name: session.name || `${event.name} (Part ${ordered.indexOf(session) + 1})`,
        }));
    }

    async delete(id: Identifier): Promise<void> {
        return this.events.delete(id);
    }

    async cloneEvent(id: Identifier, overrides: Partial<Event> = {}): Promise<Event> {
        const source = await this.getById(id);
        if (!source) {
            throw new Error(`Event not found: ${id}`);
        }
        const { id: _id, created_at, updated_at, event_sessions, ...rest } = source;
        return this.save({
            ...rest,
            ...overrides,
            template: false,
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
        const duration = event.duration;
        const end = overrides.end_at ?? new Date(new Date(start).getTime() + duration * 60000).toISOString();

        return {
            event_id: event.id as string,
            name: overrides.name ?? '',
            start_at: start,
            end_at: end,
            max_seats: overrides.max_seats ?? null,
            status: overrides.status ?? 'draft',
        } as EventSession;
    }
}
