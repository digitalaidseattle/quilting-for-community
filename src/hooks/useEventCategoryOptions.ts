import { useEffect, useState } from "react";
import { ConstantsService } from "../services/constants/ConstantsService";
import { EventCategoryOption } from "../services/constants/types";

/**
 * Loads event category options from the constants data layer (with a static fallback).
 */
export function useEventCategoryOptions() {
    const [options, setOptions] = useState<EventCategoryOption[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        ConstantsService.getInstance()
            .getEventCategories()
            .then((rows) => {
                if (!cancelled) {
                    setOptions(rows);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return { options, loading };
}
