/**
 *  ProfilesService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */
import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { Profile, ProfilesDao } from "./ProfilesDao";
import { v4 as uuid } from "uuid";

export class ProfilesService {

    private static instance: ProfilesService;

    static getInstance() {
        if (!ProfilesService.instance) {
            ProfilesService.instance = new ProfilesService();
        }
        return ProfilesService.instance;
    }

    constructor(private dao: ProfilesDao = ProfilesDao.getInstance()) { }

    empty(): Profile {
        return {
            id: null,
            name: "",
            email: "",
            first_name: "",
            last_name: "",
            phone: "",
            roles: [],
            waiver_accepted: false
        }
    }

    async getAll(): Promise<Profile[]> {
        return this.dao.getAll();
    }

    async getById(id: Identifier): Promise<Profile> {
        return this.dao.getById(id);
    }

    async find(queryModel: QueryModel, opts?: DataAccessOptions<Profile>): Promise<PageInfo<Profile>> {
        return this.dao.find(queryModel, opts);
    }

    async batchInsert(entities: Profile[]): Promise<Profile[]> {
        return this.dao.batchInsert(entities);
    }

    async insert(entity: Profile): Promise<Profile> {
        return this.dao.insert({ ...entity, id: uuid() });
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

    async findBy(field: string, value: any): Promise<Profile[]> {
        return this.dao.findBy(field, value);
    }

}
