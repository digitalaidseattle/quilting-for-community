import { DataAccessOptions, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { QueryEntityService, SupabaseEntityService } from "../EntityService";
import { EventsDao } from "./EventsDao";
import { Event } from "./types";

export class EventsEntityService
    extends SupabaseEntityService<Event>
    implements QueryEntityService<Event> {

    private static instance: EventsEntityService;

    static getInstance() {
        if (!EventsEntityService.instance) {
            EventsEntityService.instance = new EventsEntityService(EventsDao.getInstance());
        }
        return EventsEntityService.instance;
    }

    find(query: QueryModel, opts?: DataAccessOptions<Event>): Promise<PageInfo<Event>> {
        return this.dao.find(query, opts);
    }
}
