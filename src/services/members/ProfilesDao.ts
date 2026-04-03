/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { Entity } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";

export type Profile = Entity & {
    name: string;
    first_name?: string;
    last_name?: string;
    email: string;
    phone: string;
    roles: string[];
}

const DEFAULT_SELECT = '*';

export class ProfilesDao extends SupabaseDAO<Profile> {
    private static instance: ProfilesDao;

    static getInstance() {
        if (!ProfilesDao.instance) {
            ProfilesDao.instance = new ProfilesDao(SupabaseConfiguration.getInstance().getSupabaseClient(), 'profiles', { select: DEFAULT_SELECT });
        }
        return ProfilesDao.instance;
    }

}
