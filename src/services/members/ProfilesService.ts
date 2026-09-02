/**
 *  ProfilesService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */
import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { Profile, ProfilesDao, UpsertProfile } from "./ProfilesDao";

export type ProfileLabelSource = Pick<Profile, 'id' | 'name' | 'email' | 'first_name' | 'last_name'>;

export class ProfilesService {

    private static instance: ProfilesService;

    static getInstance() {
        if (!ProfilesService.instance) {
            ProfilesService.instance = new ProfilesService();
        }
        return ProfilesService.instance;
    }

    static setInstance(service: ProfilesService) {
        ProfilesService.instance = service;
    }

    constructor(private dao: ProfilesDao = ProfilesDao.getInstance()) { }

    /** Display label for a profile. Override on a subclass (then `setInstance`) to change it app-wide. */
    profileLabel(profile: ProfileLabelSource): string {
        const name = profile.name?.trim()
            || [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
        return name || profile.email || String(profile.id);
    }

    async find(queryModel: QueryModel, opts?: DataAccessOptions<Profile>): Promise<PageInfo<Profile>> {
        return this.dao.find(queryModel, opts);
    }

    async getAll(opts?: DataAccessOptions<Profile>): Promise<Profile[]> {
        return this.dao.getAll(opts);
    }

    /** Roles that can be assigned as an event instructor. Override to include admin, etc. */
    instructorCandidateRoles(): string[] {
        return ['volunteer', 'instructor', 'admin'];
    }

    /** Profiles eligible to lead an event. */
    async getInstructorCandidates(): Promise<Profile[]> {
        const profiles = await this.dao.getByOverlappingRoles(this.instructorCandidateRoles());
        return [...profiles].sort((a, b) => this.profileLabel(a).localeCompare(this.profileLabel(b)));
    }

    async getById(id: Identifier): Promise<Profile> {
        return this.dao.getById(id);
    }

    async getByAuthId(authId: Identifier): Promise<Profile | null> {
        return this.dao.getByAuthId(authId);
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
        // don't allow updates on id, auth_id, or roles
        // NOTE: email is only actually editable for login-less profiles; for
        // linked profiles the DB silently reverts it (see set_profile_updated_at)
        // since it's meant to mirror auth.users.email via handle_new_user
        const { id: _id, auth_id: _auth_id, roles: _roles, ...cleanedFields } = updatedFields;

        return this.dao.update(entityId, cleanedFields, opts);
    }

    async delete(entityId: Identifier): Promise<void> {
        // for login profiles, a profile will be created on login

        return this.dao.delete(entityId);
    }

    async upsert(entity: UpsertProfile, opts?: DataAccessOptions<Profile>): Promise<Profile> {
        // NOTE: same note about email persisting for user-linked profiles
        const { roles: _roles, ...cleanedProfile } = entity

        return this.dao.upsert(cleanedProfile, opts);
    }
}
