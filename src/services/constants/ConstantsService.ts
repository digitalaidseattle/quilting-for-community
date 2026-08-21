import { ConstantsDao } from "./ConstantsDao";
import {
    EVENT_CATEGORY_CONSTANT_TYPE,
    EventCategoryOption,
    TIMEZONE_CONSTANT_TYPE,
    TimezoneOption,
} from "./types";

/** Used when the DB has no timezone rows yet (local/dev before seed). */
export const DEFAULT_TIMEZONE_OPTIONS: TimezoneOption[] = [
    { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
    { value: "America/Denver", label: "Mountain (Denver)" },
    { value: "America/Phoenix", label: "Arizona (Phoenix)" },
    { value: "America/Chicago", label: "Central (Chicago)" },
    { value: "America/New_York", label: "Eastern (New York)" },
    { value: "UTC", label: "UTC" },
];

/** Used when the DB has no event-category rows yet (local/dev before seed). */
export const DEFAULT_EVENT_CATEGORY_OPTIONS: EventCategoryOption[] = [
    { value: "longarm", label: "Longarm" },
    { value: "quilt-lab", label: "Quilt Lab" },
    { value: "open-studio", label: "Open Studio" },
    { value: "quilting", label: "Quilting" },
    { value: "beginner", label: "Beginner" },
    { value: "advanced-beginner", label: "Advanced Beginner" },
    { value: "intermediate-beginner", label: "Intermediate Beginner" },
];

export class ConstantsService {
    private static instance: ConstantsService;

    static getInstance() {
        if (!ConstantsService.instance) {
            ConstantsService.instance = new ConstantsService();
        }
        return ConstantsService.instance;
    }

    constructor(private readonly dao = ConstantsDao.getInstance()) {}

    async getTimezones(): Promise<TimezoneOption[]> {
        try {
            const rows = await this.dao.getByType(TIMEZONE_CONSTANT_TYPE);
            if (rows.length === 0) {
                return DEFAULT_TIMEZONE_OPTIONS;
            }
            return rows.map((row) => ({ value: row.value, label: row.label }));
        } catch {
            return DEFAULT_TIMEZONE_OPTIONS;
        }
    }

    async getEventCategories(): Promise<EventCategoryOption[]> {
        try {
            const rows = await this.dao.getByType(EVENT_CATEGORY_CONSTANT_TYPE);
            if (rows.length === 0) {
                return DEFAULT_EVENT_CATEGORY_OPTIONS;
            }
            return rows.map((row) => ({ value: row.value, label: row.label }));
        } catch {
            return DEFAULT_EVENT_CATEGORY_OPTIONS;
        }
    }
}
