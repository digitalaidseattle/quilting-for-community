/**
 *  ProfilesService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */
import { Identifier } from "@digitalaidseattle/core";
import { SupabaseClient } from "@supabase/supabase-js";
import { Profile, ProfilesDao, ProfilesDaoGetAllOptions } from "./ProfilesDao";
import { EntityNotFoundError } from "../../utils/exceptions";

export class ProfilesService {

    private static instance: ProfilesService;

    static getInstance(supabaseClient?: SupabaseClient) {
        if (!ProfilesService.instance) {
            if (supabaseClient) {
                ProfilesService.instance = new ProfilesService(ProfilesDao.getInstance(supabaseClient))
            } else {
                ProfilesService.instance = new ProfilesService();
            }
        }
        return ProfilesService.instance;
    }

    constructor(private dao: ProfilesDao = ProfilesDao.getInstance()) { }

    async getAll(opts?: ProfilesDaoGetAllOptions): Promise<Profile[]> {
        return this.dao.getAll(opts);
    }

    async getById(id: Identifier): Promise<Profile | null> {
        try {
            return await this.dao.getById(id);
        } catch (error) {
            if (error instanceof EntityNotFoundError) {
                return null;
            } else {
                throw error;
            }
        }
    }

    async updateWaiverAccepted(id: Identifier, accepted: boolean): Promise<Profile | null> {
        try {
            return await this.dao.updateWaiverAccepted(id, accepted);
        } catch (error) {
            if (error instanceof EntityNotFoundError) {
                return null;
            } else {
                throw error;
            }
        }
    }
}
