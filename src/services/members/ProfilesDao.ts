/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { DataAccessOptions, Entity } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";

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

    static getInstance() {
        if (!ProfilesDao.instance) {
            ProfilesDao.instance = new ProfilesDao(SupabaseConfiguration.getInstance().getSupabaseClient(), 'profiles', { select: DEFAULT_SELECT });
        }
        return ProfilesDao.instance;
    }

    async findBy(field: string, value: any, opts?: DataAccessOptions<Profile>): Promise<Profile[]> {
        try {
            const select = this.getSelect(opts!);
            const mapper = this.getMapper(opts!);

            const { data, error } = await this.client.from(this.tableName)
                .select(select)
                .eq(field, value)
            if (error) {
                console.error('Unexpected error during select', error);
                throw new Error('Unexpected error during select');
            }
            return data.map(elem => mapper(elem));
        } catch (err) {
            console.error('Unexpected error during select:', err);
            throw err;
        }
    }

}
