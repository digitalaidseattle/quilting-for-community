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
/** 'pending' = waiting on Stripe payment, seat held until the payment expires. */
export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled';

/** One person's registration for one session (see migration 20260901120000_event_registrations.sql). */
export type EventRegistration = Entity & {
    session_id: string;
    profile_id: string;
    registration_type: RegistrationType;
    status: RegistrationStatus;
    manage_token: string;
    waiver_accepted_at: string | null;
    /** The order this registration was bought with. Null when nothing was charged. */
    order_id: string | null;
};

// Orders and payments (migration 20260929110000_orders_schema.sql).
// A person pays for an order. Its items say what was bought. All money is in cents.

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded';

export type Order = Entity & {
    profile_id: string;
    status: OrderStatus;
    /** Sum of the items. */
    amount: number;
    payment_date: string | null;
    /** Client-chosen id that makes creating the order safe to repeat. */
    request_id: string | null;
};

export type OrderItem = Entity & {
    order_id: string;
    /** The event (class) bought. */
    class_id: string;
    amount: number;
};

export type PaymentType = 'cash' | 'credit' | 'stripe';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';

export type Payment = Entity & {
    order_id: string;
    type: PaymentType;
    status: PaymentStatus;
    amount: number;
    currency: string;
    /** Stripe customer id. */
    provider_customer_id: string | null;
    /** Stripe payment intent id, set when the payment succeeds. */
    stripe_payment_id: string | null;
    stripe_checkout_session_id: string | null;
    /** Staff's note for a payment taken in person, e.g. the Clover receipt number. */
    reference: string | null;
    paid_at: string | null;
    /** When a pending payment stops holding its seats. */
    expires_at: string | null;
};
