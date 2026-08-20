/**
 *  ProfilesService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */
import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { Profile, ProfilesDao, UpsertProfile } from "./ProfilesDao";

export class ProfilesService {

    private static instance: ProfilesService;

    static getInstance() {
        if (!ProfilesService.instance) {
            ProfilesService.instance = new ProfilesService();
        }
        return ProfilesService.instance;
    }

    constructor(private dao: ProfilesDao = ProfilesDao.getInstance()) { }

    async find(queryModel: QueryModel, opts?: DataAccessOptions<Profile>): Promise<PageInfo<Profile>> {
        return this.dao.find(queryModel, opts);
    }

    async getAll(opts?: DataAccessOptions<Profile>): Promise<Profile[]> {
        return this.dao.getAll(opts);
    }

    async getById(id: Identifier): Promise<Profile> {
        return this.dao.getById(id);
    }

    async getByUid(uid: Identifier): Promise<Profile | null> {
        return this.dao.getByUid(uid);
    }

    async batchInsert(entities: Profile[], opts?: DataAccessOptions<Profile>): Promise<Profile[]> {
        // we have an on_auth_user_created trigger that creates profiles
        // when a user is created.

        return this.dao.batchInsert(entities, opts);
    }

    async insert(entity: Profile, opts?: DataAccessOptions<Profile>): Promise<Profile> {
        // we have an on_auth_user_created trigger that creates profiles
        // when a user is created.

        return this.dao.insert(entity, opts);
    }

    async update(entityId: Identifier, updatedFields: Partial<Profile>, opts?: DataAccessOptions<Profile>): Promise<Profile> {
        // don't allow updates on id, uid, or roles
        // NOTE: email update allowed on profile, but it will be synced
        // if the user email is updated (see handle_new_user function)
        const { id: _id, uid: _uid, roles: _roles, ...cleanedFields } = updatedFields;

        return this.dao.update(entityId, cleanedFields, opts);
    }

    async delete(entityId: Identifier): Promise<void> {
        // for login profiles, a profile will be created on login

        return this.dao.delete(entityId);
    }

    async upsert(entity: UpsertProfile, opts?: DataAccessOptions<Profile>): Promise<Profile> {
        // NOTE: same note about email drift
        const { roles: _roles, ...cleanedProfile } = entity

        return this.dao.upsert(cleanedProfile, opts);
    }
}
