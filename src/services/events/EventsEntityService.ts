import { EntityService, SupabaseEntityService } from "../EntityService";
import { EventsDao } from "./EventsDao";
import { Event } from "./types";

export class EventsEntityService
    extends SupabaseEntityService<Event>
    implements EntityService<Event> {

    private static instance: EventsEntityService;

    static getInstance() {
        if (!EventsEntityService.instance) {
            EventsEntityService.instance = new EventsEntityService(EventsDao.getInstance());
        }
        return EventsEntityService.instance;
    }
}
