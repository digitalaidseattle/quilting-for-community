import { PageInfo, QueryModel } from "@digitalaidseattle/core";
import { QueryEntityService, SupabaseEntityService } from "../EntityService";
import { EventSessionsDao } from "./EventSessionsDao";
import { EventSession } from "./types";

export class EventSessionsService
    extends SupabaseEntityService<EventSession>
    implements QueryEntityService<EventSession> {

    private static instance: EventSessionsService;

    static getInstance() {
        if (!EventSessionsService.instance) {
            EventSessionsService.instance = new EventSessionsService(EventSessionsDao.getInstance());
        }
        return EventSessionsService.instance;
    }

    find(query: QueryModel): Promise<PageInfo<EventSession>> {
        return this.dao.find(query);
    }

    getByEventId(eventId: string): Promise<EventSession[]> {
        return EventSessionsDao.getInstance().getByEventId(eventId);
    }
}
