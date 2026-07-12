/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { Entity, Identifier } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import { EntityNotFoundError } from "../../utils/exceptions";

export type Profile = Entity & {
    name: string;
    first_name?: string;
    last_name?: string;
    email: string;
    phone: string;
    roles: string[];
    waiver_accepted: boolean;
}

const DEFAULT_SELECT = '*';

export class ProfilesDao extends SupabaseDAO<Profile> {
    private static instance: ProfilesDao;

    static getInstance(supabaseClient?: SupabaseClient) {
        if (!ProfilesDao.instance) {
            ProfilesDao.instance = new ProfilesDao(supabaseClient || SupabaseConfiguration.getInstance().getSupabaseClient(), 'profiles', { select: DEFAULT_SELECT });
        }
        return ProfilesDao.instance;
    }

    async getById(id: Identifier): Promise<Profile> {
        const { data, error } = await this.client
            .from<string, { Row: Profile }>(this.tableName)
            .select()
            .eq('id', id)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(`Error fetching profile with id ${id}:`, error);
        }

        if (!data) {
            throw new EntityNotFoundError('Profile', id);
        }

        return data;
    }

}
