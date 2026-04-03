/**
 *  ProfilesService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */
import { Identifier } from "@digitalaidseattle/core";
import { Profile, ProfilesDao } from "./ProfilesDao";

export class ProfilesService {

    private static instance: ProfilesService;

    static getInstance() {
        if (!ProfilesService.instance) {
            ProfilesService.instance = new ProfilesService();
        }
        return ProfilesService.instance;
    }

    constructor(private dao: ProfilesDao = ProfilesDao.getInstance()) { }

    async getAll(): Promise<Profile[]> {
        return this.dao.getAll();
    }

    async getById(id: Identifier): Promise<Profile> {
        return this.dao.getById(id);
    }

    async batchInsert(entities: Profile[]): Promise<Profile[]> {
        return this.dao.batchInsert(entities);
    }

    async insert(entity: Profile): Promise<Profile> {
        return this.dao.insert(entity);
    }

    async update(id: Identifier, changes: Partial<Profile>): Promise<Profile> {
        return this.dao.update(id, changes);
    }

    async delete(id: Identifier): Promise<void> {
        await this.dao.delete(id);
    }

    async upsert(entity: Profile): Promise<Profile> {
        return this.dao.upsert(entity);
    }

}
