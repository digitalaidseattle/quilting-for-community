import { Entity } from "@digitalaidseattle/core";
import { Profile } from "../members/ProfilesDao";

export type SessionStatus = 'draft' | 'published' | 'cancelled';

export type EventStatus = SessionStatus;
export type EventInstructor = Pick<Profile, 'id' | 'name' | 'email' | 'first_name' | 'last_name'>;

export type Event = Entity & {
    name: string;
    description: string;
    notes: string;
    category: string;
    photo_path: string;
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
    start_at: string;
    end_at: string;
    max_seats: number | null;
    status: SessionStatus;
    part: number;
    instructor_id: string | null;
    instructor?: EventInstructor | null;
};

export type RegistrationType = 'participant' | 'volunteer';
export type RegistrationStatus = 'confirmed' | 'cancelled';

/** One person's registration for one session (see migration 20260901120000_event_registrations.sql). */
export type EventRegistration = Entity & {
    session_id: string;
    profile_id: string;
    registration_type: RegistrationType;
    status: RegistrationStatus;
    manage_token: string;
    waiver_accepted_at: string | null;
};
