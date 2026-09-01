import { FieldErrors, Resolver } from "react-hook-form";
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

    // Other event fields have defaults and are optional on create. Only reject
    // values that would fail a database constraint if they were submitted.
    if (!isMissingNumber(event.duration) && event.duration < 1) {
        errors.duration = 'Duration must be at least 1 minute';
    }

    if (!isMissingNumber(event.max_seats) && event.max_seats < 1) {
        errors.max_seats = 'Capacity must be at least 1';
    }

    if (!isMissingNumber(event.volunteer_seat_count) && event.volunteer_seat_count < 0) {
        errors.volunteer_seat_count = 'Volunteer seats cannot be negative';
    } else if (
        !isMissingNumber(event.volunteer_seat_count)
        && !isMissingNumber(event.max_seats)
        && event.volunteer_seat_count > event.max_seats
    ) {
        errors.volunteer_seat_count = 'Volunteer seats cannot exceed max seats';
    }

    if (!isMissingNumber(event.price) && event.price < 0) {
        errors.price = 'Price cannot be negative';
    }

    // Templates are reusable blueprints and never need sessions. Draft events
    // can be saved with just a name. Sessions are only required to publish.
    if (!event.template && event.status === 'published' && (event.event_sessions?.length ?? 0) === 0) {
        errors.sessions = 'Add at least one session before publishing';
    } else if ((event.event_sessions ?? []).some((session) => session.status === 'published' && !session.instructor_id)) {
        errors.sessions = 'Assign an instructor before publishing a session';
    }

    return errors;
}

export function hasEventErrors(errors: EventFieldErrors): boolean {
    return Object.keys(errors).length > 0;
}

export const eventFormResolver: Resolver<Event> = async (values) => {
    const fieldErrors = validateEvent(values);
    if (!hasEventErrors(fieldErrors)) {
        return { values, errors: {} };
    }

    const errors: FieldErrors<Event> = {};
    if (fieldErrors.name) {
        errors.name = { type: 'validate', message: fieldErrors.name };
    }
    if (fieldErrors.duration) {
        errors.duration = { type: 'validate', message: fieldErrors.duration };
    }
    if (fieldErrors.max_seats) {
        errors.max_seats = { type: 'validate', message: fieldErrors.max_seats };
    }
    if (fieldErrors.volunteer_seat_count) {
        errors.volunteer_seat_count = { type: 'validate', message: fieldErrors.volunteer_seat_count };
    }
    if (fieldErrors.price) {
        errors.price = { type: 'validate', message: fieldErrors.price };
    }
    if (fieldErrors.sessions) {
        errors.event_sessions = {
            type: 'validate',
            message: fieldErrors.sessions,
        };
    }

    return { values: {}, errors };
};
