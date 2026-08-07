import { Entity } from "@digitalaidseattle/core";

export type SessionStatus = 'draft' | 'published' | 'cancelled';

export type EventStatus = SessionStatus;

export type Event = Entity & {
    name: string;
    description: string;
    notes: string;
    category: string;
    duration: number;
    max_seats: number;
    volunteer_seat_count: number;
    price_min: number;
    price: number;
    price_max: number;
    template: boolean;
    status: EventStatus;
    /** Denormalized name@description@category for generalized search. */
    search_key: string;
    event_sessions?: EventSession[];
};

export type EventSession = Entity & {
    event_id: string;
    description: string;
    start_at: string;
    end_at: string;
    max_seats: number | null;
    status: SessionStatus;
};
