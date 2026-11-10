/**
 *  ProfilesService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */
import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { Profile, ProfilesDao, ProfileStatus, UpsertProfile } from "./ProfilesDao";

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

    empty(): Profile {
        return {
            id: null,
            auth_id: null,
            name: "",
            email: "",
            first_name: "",
            last_name: "",
            phone: "",
            roles: [],
            waiver_accepted: false,
            status: "active"
        }
    }

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

    async getByAuthId(uid: Identifier): Promise<Profile | null> {
        const matches = await this.dao.findBy('auth_id', uid);
        if (matches.length === 0) {
            return null;
        }
        if (matches.length === 1) {
            return matches[0];
        }
        throw new Error(`More than one profile found with auth_id= ${uid}`);
    }

    async batchInsert(entities: Profile[], opts?: DataAccessOptions<Profile>): Promise<Profile[]> {
        // we have an on_auth_user_created trigger that creates profiles
        // when a user is created.

        return this.dao.batchInsert(entities, opts);
    }

    async insert(entity: Profile, opts?: DataAccessOptions<Profile>): Promise<Profile> {
        // we have an on_auth_user_created trigger that creates profiles
        // when a user is created.
        const updated: any = {
            ...entity
        }
        delete updated.id;  // let DB do the work; alternatively we could use uuid() here
        return this.dao.insert(updated, opts);
    }

    async update(entityId: Identifier, updatedFields: Partial<Profile>, opts?: DataAccessOptions<Profile>): Promise<Profile> {
        // don't allow updates on id, auth_id, or roles
        // NOTE: email is only actually editable for login-less profiles; for
        // linked profiles the DB silently reverts it (see set_profile_updated_at)
        // since it's meant to mirror auth.users.email via handle_new_user
        const { id: _id,
            auth_id: _auth_id,
            roles: _roles,
            ...cleanedFields
        } = {
            ...updatedFields
        };

        return this.dao.update(entityId, cleanedFields, opts);
    }

    /**
     * Enable/disable a profile. Admin-only: for a non-admin the DB silently
     * reverts the change (see set_profile_updated_at), same as it does for email.
     */
    async updateStatus(entityId: Identifier, status: ProfileStatus, opts?: DataAccessOptions<Profile>): Promise<Profile> {
        return this.dao.update(entityId, { status }, opts);
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

    async findBy(field: string, value: any): Promise<Profile[]> {
        return this.dao.findBy(field, value);
    }

    async searchBy(field: string, value: any): Promise<Profile[]> {
        return this.dao.searchBy(field, value);
    }

    async importProfiles(files: File[]): Promise<Profile[]> {
        const profiles: Profile[] = [];
        for (const file of files) {
            const ext = file.name.split('.').pop()?.toLowerCase();
            switch (ext) {
                case 'json':
                    const jsonImporter = new JSONProfileImporter();
                    const results = await jsonImporter.importProfiles(file);
                    profiles.push(...results);
                    break;
                case 'csv':
                default:
                    throw new Error(`File ${file.name} is not a supported format.`);
            }
        }
        return profiles;
    }

    async validateFiles(files: File[]): Promise<Record<string, string[]>> {
        const errors: Record<string, string[]> = {};
        for (const file of files) {
            const ext = file.name.split('.').pop()?.toLowerCase();
            switch (ext) {
                case 'json':
                    const jsonImporter = new JSONProfileImporter();
                    const results = await jsonImporter.validateFile(file);
                    errors[file.name] = results;
                    break;
                case 'csv':
                default:
                    errors[file.name] = [...(errors[file.name] || []), `File ${file.name} is not a supported format. Only JSON is currently supported.`];
            }
        }
        return errors;
    }

}

interface ProfileImporter {
    importProfiles(file: File): Promise<Profile[]>;
    validateFile(file: File): Promise<string[]>;
}

/* From Acuity
{ "clients": 
 [{
    "firstName": "Fanae",
    "lastName": "Aaron",
    "phone": "+13238428244",
    "phoneFormatted": "+13238428244",
    "email": "fanae@mac.com",
    "timezone": "America/Los_Angeles",
    "hasAccount": false,
    "clientId": null,
    "ecd": "YWN1aXR5OkFDVUlUWV9BRVNfS0VZXzA2MjEyMDIwOlBWNExhT0FnMUIxTVJPbEJWSHJpWFZmQkNYREFpQUcxUHo1eW9jK1NPZ0NKaS8rdzVxQXVza1ZtOWUvSWt1emlCRUF4cXZCdnNGZEhnbDBkZ2N4UkVMb2xvWWV3c3Q2c2VERHlLaW9uU2Y1MTRyS09pcUdkRkpKbFh3PT0%3D",
    "ecdWithEmail": "YWN1aXR5OkFDVUlUWV9BRVNfS0VZXzA2MjEyMDIwOjRvd3lFOGFmOG1HcGNGaXBJSCtGR1lSOXk2TFZiYXhBSk90aU1zbk9tNVk3VlhPM0Rpb1dLOUs1ZS9ocGlzTHNIbS82Mk1rbk5rUjFBUDJkbG5hOWRLT2NqamdESGJpNzBoeHRlQmVhUnNReXBxQVVRY3F1WGVKU2pZaTlDV0ViV01wME5xeUhYK3cwSXpGT3NaazNXZE09"
}]
*/
class JSONProfileImporter implements ProfileImporter {

    async importProfiles(file: File): Promise<Profile[]> {
        const profileService = ProfilesService.getInstance();
        return file.text()
            .then(text => {
                const json = JSON.parse(text);
                json.clients = json.clients || [];
                const profiles = json.clients.map((client: any) => this.mapJsonToProfile(client));
                return profileService.batchInsert(profiles);
            });
    }

    mapJsonToProfile(json: any): Profile {
        return {
            auth_id: null,
            name: json.firstName + ' ' + json.lastName,
            first_name: json.firstName,
            last_name: json.lastName,
            email: json.email,
            phone: json.phoneFormatted
        } as Profile;
    }

    validateFile(_file: File): Promise<string[]> {
        return Promise.resolve([]);
    }

}