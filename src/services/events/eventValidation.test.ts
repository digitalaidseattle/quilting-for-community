import { Event } from "./types";
import { MAX_DURATION_MINUTES, validateEvent } from "./eventValidation";

function event(overrides: Partial<Event> = {}): Event {
    return {
        name: "Intro",
        duration: 60,
        max_seats: 10,
        volunteer_seat_count: 2,
        price: 0,
        template: true,
        ...overrides,
    } as Event;
}

describe("validateEvent duration", () => {
    test("accepts durations up to 24 hours", () => {
        expect(validateEvent(event({ duration: 1 })).duration).toBeUndefined();
        expect(validateEvent(event({ duration: MAX_DURATION_MINUTES })).duration).toBeUndefined();
    });

    test("rejects durations over 24 hours", () => {
        expect(validateEvent(event({ duration: MAX_DURATION_MINUTES + 1 })).duration)
            .toBe("Duration cannot exceed 24 hours (1440 minutes)");
    });
});
