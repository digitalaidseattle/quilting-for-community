import { ConstantsService } from "../services/constants/ConstantsService";
import { EventCategoryOption } from "../services/constants/types";
import { useCachedResource } from "./CacheFactory";

/**
 * Loads event category options from the constants data layer (with a static fallback).
 */
export function useEventCategoryOptions() {
    const { data, loading } = useCachedResource<EventCategoryOption[]>({
        key: "event-categories",
        fetcher: () => ConstantsService.getInstance().getEventCategories(),
    });

    return { options: data ?? [], loading };
}
