import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { EventSession } from "./types";

const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000;

export class EventSessionsDao extends SupabaseDAO<EventSession> {
    private static instance: EventSessionsDao;

    static empty(eventId = ''): EventSession {
        return {
            event_id: eventId,
            start_at: new Date().toISOString().slice(0, 16),
            end_at: new Date(Date.now() + DEFAULT_SESSION_DURATION_MS).toISOString().slice(0, 16),
            status: 'draft',
        } as EventSession;
    }

    static getInstance() {
        if (!EventSessionsDao.instance) {
            EventSessionsDao.instance = new EventSessionsDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'event_sessions'
            );
        }
        return EventSessionsDao.instance;
    }

    async getByEventId(eventId: string): Promise<EventSession[]> {
        const { data, error } = await this.client
            .from(this.tableName)
            .select(this.select)
            .eq('event_id', eventId)
            .order('start_at');

        if (error) {
            throw error;
        }

        return (data ?? []).map((row) => this.mapJson(row));
    }
}
