/**
 *  ProfilesDao.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { DataAccessOptions, Entity, Identifier, QueryModel } from "@digitalaidseattle/core";
import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";

export type Profile = Entity & {
    auth_id: string | null;
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

    async getByAuthId(authId: Identifier): Promise<Profile | null> {
        const query: QueryModel = {
            page: 0,
            pageSize: 1,  // expecting one result
            sortField: "created_at",
            sortDirection: "asc",
            filterModel: {
                items: [
                    {
                        field: "auth_id",
                        operator: "=",
                        value: authId
                    }
                ]
            },
        };

        try {
            const { rows } = await this.find(query);

            return rows && rows.length > 0 ? rows[0] : null;
        } catch (err) {
            console.log("getByAuthId error: ", err);
            throw err;
        }
    }
}
