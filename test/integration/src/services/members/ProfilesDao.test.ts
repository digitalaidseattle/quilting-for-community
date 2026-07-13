import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { ProfilesDao } from "../../../../../src/services/members/ProfilesDao";
import { EntityNotFoundError } from "../../../../../src/utils/exceptions";
import process from "node:process";

const adminClient = createClient(
    "http://localhost:54321",
    process.env.SUPABASE_SECRET_KEY
);

const appClient = createClient(
    "http://localhost:54321",
    process.env.VITE_SUPABASE_ANON_KEY
);

describe("ProfilesDao", () => {
    let profilesDao: ProfilesDao;

    beforeAll(() => {
        profilesDao = ProfilesDao.getInstance(adminClient);
    });

    beforeEach(async () => {
        const { data, error } = await adminClient
            .from("profiles")
            .select("id")
            .ilike("email", "PROFILE_DAO_TEST_%");

        if (error) {
            console.error("Error getting test profiles for cleanup: ", error);
        }

        if (data && data.length > 0) {
            for (const profile of data) {
                await adminClient.auth.admin.deleteUser(profile.id);
            }
        }
    });

    test("getById should return a single profile", async () => {
        const { data, error } = await adminClient.auth.admin.createUser({
            email: `PROFILE_DAO_TEST_${Date.now()}@example.com`,
            password: "password",
            email_confirm: true,
            user_metadata: {
                first_name: "Test",
                last_name: "User",
                phone: "1234567890",
                roles: ["member"],
            },
        });

        if (error) {
            console.error("Failed to create test user", error);
            throw error;
        }

        if (!data.user) {
            console.error("No user returned from createUser");
            throw new Error("No user returned from createUser");
        }

        const { user } = data;
        const { user_metadata: userMetaData } = user;

        const profile = await profilesDao.getById(data.user.id);
        expect(profile).toBeDefined();
        expect(profile.id).toBe(data.user.id);
        expect(profile.email).toBe(data.user.email);
        expect(profile.first_name).toBe(userMetaData.first_name);
        expect(profile.last_name).toBe(userMetaData.last_name);
        expect(profile.roles).toEqual(userMetaData.roles);
        expect(profile.waiver_accepted).toBe(false);
    });

    test("getById should raise an error if not found", async () => {
        const nonExistentId = "00000000-0000-0000-0000-000000000000";
        await expect(profilesDao.getById(nonExistentId)).rejects.toThrow(EntityNotFoundError);
    });
});