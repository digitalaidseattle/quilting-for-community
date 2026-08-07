import dayjs from "dayjs";

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

const STORAGE_KEY = "q4c.admin.timezone";

export function loadStoredTimezone(): string {
    try {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_TIMEZONE;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

export function storeTimezone(timeZone: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, timeZone);
    } catch {
        // ignore storage access errors
    }
}

type ZonedParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
};

/**
 * Read calendar parts of an instant in an IANA timezone via Intl.
 * Avoids dayjs's timezone plugin, which breaks react-big-calendar's dayjsLocalizer.
 */
function getZonedParts(date: Date, timeZone: string): ZonedParts {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) => {
        const value = parts.find((part) => part.type === type)?.value;
        return value == null ? 0 : Number(value);
    };

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: get("hour"),
        minute: get("minute"),
        second: get("second"),
    };
}

/** Format a stored UTC timestamp for display in the given IANA timezone. */
export function formatSessionDate(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
    if (!iso) return "";
    return dayjs(utcIsoToWallDate(iso, timeZone)).format("ddd, MMM D, YYYY, h:mm A");
}

/**
 * Convert a UTC ISO timestamp into a Date whose local Y/M/D/H/M/S match the
 * wall-clock time in `timeZone`. Used so react-big-calendar (which only speaks
 * browser-local Dates) can display events in an explicit timezone.
 */
export function utcIsoToWallDate(iso: string, timeZone: string): Date {
    const parts = getZonedParts(new Date(iso), timeZone);
    return new Date(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );
}

/**
 * Inverse of utcIsoToWallDate: read the Date's local components as wall-clock
 * in `timeZone` and return the corresponding UTC ISO string.
 */
export function wallDateToUtcIso(date: Date, timeZone: string): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();
    const ms = date.getMilliseconds();

    // Wanted wall-clock as if those numbers were UTC, then correct by the zone offset.
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    let utcMs = wanted;
    // A couple of iterations covers normal offsets and most DST edges.
    for (let i = 0; i < 2; i += 1) {
        const parts = getZonedParts(new Date(utcMs), timeZone);
        const got = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
            ms,
        );
        utcMs += wanted - got;
    }
    return new Date(utcMs).toISOString();
}

/** Current instant as a wall-clock Date in `timeZone`. */
export function nowAsWallDate(timeZone: string): Date {
    return utcIsoToWallDate(new Date().toISOString(), timeZone);
}
