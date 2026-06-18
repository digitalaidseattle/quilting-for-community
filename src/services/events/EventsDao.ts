import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { Event } from "./types";

export class EventsDao extends SupabaseDAO<Event> {
    private static instance: EventsDao;

    static empty(): Event {
        return {
            name: '',
            description: '',
            notes: '',
            category: 'general',
            duration: 60,
            max_seats: 10,
            volunteer_seat_count: 2,
            price_min: 0,
            price: 0,
            price_max: 0,
            template: false,
        } as Event;
    }

    static getInstance() {
        if (!EventsDao.instance) {
            EventsDao.instance = new EventsDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'events'
            );
        }
        return EventsDao.instance;
    }
}
