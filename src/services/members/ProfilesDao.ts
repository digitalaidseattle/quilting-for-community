/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { Entity, Identifier } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import { DatabaseError, EntityNotFoundError } from "../../utils/exceptions";

export type Profile = Entity & {
    name: string;
    first_name?: string;
    last_name?: string;
    email: string;
    phone: string;
    roles: string[];
    waiver_accepted: boolean;
}

type SupabaseProfileDatabase = {
    Row: Profile;
    Update: Partial<Profile>;
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
            .from<string, SupabaseProfileDatabase>(this.tableName)
            .select()
            .eq('id', id)
            .limit(1)
            .maybeSingle();

        if (error) {
            throw new DatabaseError(`Error fetching profile ${id}`, { cause: error });
        }

        if (!data) {
            throw new EntityNotFoundError('Profile', id);
        }

        return data;
    }

    async updateWaiverAccepted(id: Identifier, accepted: boolean): Promise<Profile> {
        const { data, error } = await this.client
            .from<string, SupabaseProfileDatabase>(this.tableName)
            .update({ waiver_accepted: accepted })
            .eq('id', id)
            .limit(1)
            .select()
            .maybeSingle();

        if (error) {
            throw new DatabaseError(`Error updating profile ${id}`, { cause: error });
        }

        if (!data) {
            throw new EntityNotFoundError('Profile', id);
        }

        return data;
    }
}
