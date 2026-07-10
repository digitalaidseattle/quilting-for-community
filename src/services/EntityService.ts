/**
 * Service-layer contract mirroring DataAccessObject, with optional pagination.
 */
export type { Entity, EntityService, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
export { SupabaseEntityService } from "@digitalaidseattle/supabase";

import { Entity, EntityService, PageInfo, QueryModel } from "@digitalaidseattle/core";

export interface QueryEntityService<T extends Entity> extends EntityService<T> {
    find(query: QueryModel): Promise<PageInfo<T>>;
}
