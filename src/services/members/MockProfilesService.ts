/**
 *  ProfilesService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */
import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { Profile, ProfilesDao } from "./ProfilesDao";


const DUMMY_PROFILES: Profile[] = [
    { id: '1', auth_id: '1', name: 'John Doe', email: 'john.doe@example.com', phone: '123-456-7890', roles: ["member", "instructor"], waiver_accepted: true, status: 'active' },
    { id: '2', auth_id: null, name: 'Example User', email: 'example.user@example.com', phone: '123-456-7890', roles: ["instructor"], waiver_accepted: true, status: 'active' },
    { id: '3', auth_id: null, name: 'Place Holder', email: 'place.holder@example.com', phone: '123-456-7890', roles: ["member"], waiver_accepted: false, status: 'active' },
] as Profile[];

export class MockProfilesService {

    private static instance: MockProfilesService;

    static getInstance() {
        if (!MockProfilesService.instance) {
            MockProfilesService.instance = new MockProfilesService();
        }
        return MockProfilesService.instance;
    }

    constructor(private dao: ProfilesDao = ProfilesDao.getInstance()) { }

    async getAll(): Promise<Profile[]> {
        return DUMMY_PROFILES;
    }

    async getById(_id: Identifier): Promise<Profile> {
        return DUMMY_PROFILES[0];
        // return this.dao.getById(id);
    }

    async find(_queryModel: QueryModel, _opts?: DataAccessOptions<Profile>): Promise<PageInfo<Profile>> {
        return {
            rows: DUMMY_PROFILES,
            totalRowCount: DUMMY_PROFILES.length
        }
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
