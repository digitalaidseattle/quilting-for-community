/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { DataAccessOptions, Entity, Identifier, QueryModel } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";

export type Profile = Entity & {
    uid: string | null;
    name: string;
    first_name?: string;
    last_name?: string;
    email: string;
    phone: string;
    roles: string[];
    waiver_accepted: boolean;
}

// Partial<Profile> but id is required
export type UpsertProfile = Partial<Profile> & Pick<Profile, "id">;

const DEFAULT_SELECT = '*';

export class ProfilesDao extends SupabaseDAO<Profile> {
    private static instance: ProfilesDao;

    static getInstance() {
        if (!ProfilesDao.instance) {
            ProfilesDao.instance = new ProfilesDao(SupabaseConfiguration.getInstance().getSupabaseClient(), 'profiles', { select: DEFAULT_SELECT });
        }
        return ProfilesDao.instance;
    }

    override upsert(entity: UpsertProfile, opts?: DataAccessOptions<Profile> | undefined): Promise<Profile> {
        return super.upsert(entity as Profile, opts);
    }

    async getByUid(uid: Identifier): Promise<Profile | null> {
        const query: QueryModel = {
            page: 0,
            pageSize: 1,  // expecting one result
            sortField: "created_at",
            sortDirection: "asc",
            filterModel: {
                items: [
                    {
                        field: "uid",
                        operator: "=",
                        value: uid
                    }
                ]
            },
        };

        try {
            const { rows } = await this.find(query);

            return rows && rows.length > 0 ? rows[0] : null;
        } catch (err) {
            console.log("getByUid error: ", err);
            throw err;
        }
    }

    // TODO promote to SupabaseDao
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
