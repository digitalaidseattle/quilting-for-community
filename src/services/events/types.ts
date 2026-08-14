import { Entity } from "@digitalaidseattle/core";

export type SessionStatus = 'draft' | 'published' | 'cancelled';

export type EventStatus = SessionStatus;
export type EventInstructor = {
    id: string;
    name: string;
    email: string;
    first_name?: string;
    last_name?: string;
};

export type Event = Entity & {
    name: string;
    description: string;
    notes: string;
    category: string;
    instructor_id: string | null;
    instructor?: EventInstructor | null;
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
