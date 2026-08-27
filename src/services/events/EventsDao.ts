import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { Event } from "./types";

const EVENT_SELECT =
    '*, instructor:profiles!instructor_id(id, name, email, first_name, last_name), event_sessions(*)';

export class EventsDao extends SupabaseDAO<Event> {
    private static instance: EventsDao;

    static empty(): Event {
        return {
            name: '',
            description: '',
            notes: '',
            category: '',
            instructor_id: null,
            duration: 60,
            max_seats: 10,
            volunteer_seat_count: 2,
            price_min: 0,
            price: 0,
            price_max: 0,
            template: false,
            status: 'draft',
            search_key: '',
            event_sessions: [] as Event['event_sessions'],
        } as Event;
    }

    static getInstance() {
        if (!EventsDao.instance) {
            EventsDao.instance = new EventsDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'events',
                { select: EVENT_SELECT }
            );
        }
        return EventsDao.instance;
    }
}
