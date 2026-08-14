import { Event } from "./types";

export type EventFieldErrors = Partial<Record<
    'name' | 'duration' | 'max_seats' | 'volunteer_seat_count' | 'price' | 'sessions',
    string
>>;

function isMissingNumber(value: number | null | undefined): boolean {
    return value == null || Number.isNaN(value);
}

export function validateEvent(event: Event): EventFieldErrors {
    const errors: EventFieldErrors = {};

    if (!event.name.trim()) {
        errors.name = 'Title is required';
    }

    if (isMissingNumber(event.duration) || event.duration < 1) {
        errors.duration = 'Duration must be at least 1 minute';
    }

    if (isMissingNumber(event.max_seats) || event.max_seats < 1) {
        errors.max_seats = 'Capacity must be at least 1';
    }

    if (isMissingNumber(event.volunteer_seat_count) || event.volunteer_seat_count < 0) {
        errors.volunteer_seat_count = 'Volunteer seats cannot be negative';
    } else if (!isMissingNumber(event.max_seats) && event.volunteer_seat_count > event.max_seats) {
        errors.volunteer_seat_count = 'Volunteer seats cannot exceed max seats';
    }

    if (isMissingNumber(event.price) || event.price < 0) {
        errors.price = 'Price is required and cannot be negative';
    }

    // Templates are reusable blueprints; scheduled events need a date/time session.
    if (!event.template && (event.event_sessions?.length ?? 0) === 0) {
        errors.sessions = 'Add at least one session with a date and time';
    }

    return errors;
}

export function hasEventErrors(errors: EventFieldErrors): boolean {
    return Object.keys(errors).length > 0;
}
