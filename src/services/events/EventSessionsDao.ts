import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { EventSession } from "./types";

const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000;

export class EventSessionsDao extends SupabaseDAO<EventSession> {
    private static instance: EventSessionsDao;

    static empty(eventId = ''): EventSession {
        return {
            event_id: eventId,
            start_at: new Date().toISOString(),
            end_at: new Date(Date.now() + DEFAULT_SESSION_DURATION_MS).toISOString(),
            max_seats: null,
            status: 'draft',
            part: 1,
            instructor_id: null,
        } as EventSession;
    }

    static getInstance() {
        if (!EventSessionsDao.instance) {
            EventSessionsDao.instance = new EventSessionsDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'event_sessions',
                { select: '*, instructor:profiles!instructor_id(id, name, email, first_name, last_name)' }
            );
        }
        return EventSessionsDao.instance;
    }

    async getByEventId(eventId: string): Promise<EventSession[]> {
        const { data, error } = await this.client
            .from(this.tableName)
            .select(this.select)
            .eq('event_id', eventId)
            .order('part')
            .order('start_at');

        if (error) {
            throw error;
        }

        return (data ?? []).map((row) => this.mapJson(row));
    }
}
