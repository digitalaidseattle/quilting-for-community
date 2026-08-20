import { useEffect, useState } from "react";
import { ConstantsService } from "../services/constants/ConstantsService";
import { TimezoneOption } from "../services/constants/types";

/**
 * Loads timezone options from the constants data layer (with a static fallback).
 */
export function useTimezoneOptions() {
    const [options, setOptions] = useState<TimezoneOption[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        ConstantsService.getInstance()
            .getTimezones()
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
