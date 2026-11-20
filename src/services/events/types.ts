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
export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled';

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

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded';

export type Order = Entity & {
    profile_id: string;
    status: OrderStatus;
    /** Sum of the items. */
    amount: number;
    payment_date: string | null;
    request_id: string | null;
};

export type OrderItem = Entity & {
    order_id: string;
    event_id: string;
    amount: number;
};

export type PaymentType = 'cash' | 'stripe' | 'paypal' | 'clover';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';

export type Payment = Entity & {
    order_id: string;
    type: PaymentType;
    status: PaymentStatus;
    amount: number;
    currency: string;
    provider_customer_id: string | null;
    /** The money movement: Stripe payment intent, PayPal capture, or Clover payment. */
    provider_payment_id: string | null;
    /** The hosted checkout: Stripe Checkout session or PayPal order. */
    provider_checkout_id: string | null;
    /** Staff's note for a payment taken in person. */
    reference: string | null;
    paid_at: string | null;
    expires_at: string | null;
};

/** What happened to a payment at one moment. Append-only, written by the database. */
export type PaymentHistory = Entity & {
    payment_id: string;
    /** 'initiated', 'checkout_started', a status the payment moved to, or 'refund'. */
    event: string;
    from_status: PaymentStatus | null;
    to_status: PaymentStatus | null;
    type: PaymentType;
    provider_id: string | null;
    amount: number;
    /** A person's email, a system function's name (e.g. 'stripe-webhook', 'hold-expiry'), or a database role. */
    actor: string;
    provider_event_id: string | null;
};

export type Refund = Entity & {
    payment_id: string;
    amount: number;
    provider_refund_id: string;
    status: string;
    reason: string | null;
};
