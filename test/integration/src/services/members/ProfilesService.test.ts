import { beforeAll, describe, expect, test } from "vitest";
import { createClient, User } from "@supabase/supabase-js";
import { Profile } from "../../../../../src/services/members/ProfilesDao";
import { ProfilesService } from "../../../../../src/services/members/ProfilesService";
import { DatabaseError } from "../../../../../src/utils/exceptions";
import process from "node:process";

const adminClient = createClient(
    "http://localhost:54321",
    process.env.SUPABASE_SECRET_KEY
);

const createTestUser = async (prefix?: string) => {
    const dataPrefix = prefix || "";

    const { data, error } = await adminClient.auth.admin.createUser({
        email: `PROFILE_SERVICE_TEST${dataPrefix}_${Date.now()}@example.com`,
        password: "password",
        email_confirm: true,
        user_metadata: {
            first_name: `Test${dataPrefix}`,
            last_name: `User${dataPrefix}`,
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

    return data.user;
};

describe("ProfilesService", () => {
    let profilesService: ProfilesService;
    const testUsers: User[] = [];

    beforeAll(async () => {
        profilesService = ProfilesService.getInstance(adminClient);

        // Clean up any test profiles created in previous tests
        const { data, error } = await adminClient
            .from("profiles")
            .select("id")
            .ilike("email", "PROFILE_SERVICE_TEST_%");

        if (error) {
            console.error("Error getting test profiles for cleanup: ", error);
        }

        if (data && data.length > 0) {
            for (const profile of data) {
                await adminClient.auth.admin.deleteUser(profile.id);
            }
        }

        for (let i = 0; i < 26; i++) {
            const user = await createTestUser(`_${String(i).padStart(2, '0')}`);
            testUsers.push(user);
        }
    });

    test("getById should return a single profile", async () => {
        expect.assertions(1);

        const user = testUsers[0];

        const profile = await profilesService.getById(user.id);
        // expect(profile).toBeDefined();
        expect.assert(profile !== null)
        expect(profile).toMatchObject({
            id: user.id,
            email: user.email,
            first_name: user.user_metadata.first_name,
            last_name: user.user_metadata.last_name,
            roles: user.user_metadata.roles,
            waiver_accepted: false
        });
    });

    test("getById should return null if not found", async () => {
        expect.assertions(1);
        const nonExistentId = "00000000-0000-0000-0000-000000000000";
        expect(await profilesService.getById(nonExistentId)).toBeNull();
    });

    test("getById should raise an error on any database error", async () => {
        expect.assertions(1);
        const badId = "invalid-uuid";
        await expect(profilesService.getById(badId)).rejects.toThrow(DatabaseError);
    });

    test.each([
        { opts: {} },
        { opts: { count: 10 } }
    ])("getAll should return an array of profiles with count options $opts", async ({ opts }) => {
        expect.assertions(4);

        const profiles = await profilesService.getAll(opts);

        const expectedCount = opts?.count || 25

        expect(Array.isArray(profiles)).toBe(true);
        expect(profiles.length).toBe(expectedCount);

        expect(profiles[0]).toMatchObject({
            id: testUsers[0].id,
            email: testUsers[0].email,
            first_name: testUsers[0].user_metadata.first_name,
            last_name: testUsers[0].user_metadata.last_name,
            roles: testUsers[0].user_metadata.roles,
            waiver_accepted: false,
        });

        const lastProfile = profiles[expectedCount - 1];
        expect(lastProfile).toMatchObject({
            id: testUsers[expectedCount - 1].id,
            email: testUsers[expectedCount - 1].email,
            first_name: testUsers[expectedCount - 1].user_metadata.first_name,
            last_name: testUsers[expectedCount - 1].user_metadata.last_name,
            roles: testUsers[expectedCount - 1].user_metadata.roles,
            waiver_accepted: false,
        });
    });

    test("getAll should get the specified page of profiles", async () => {
        expect.assertions(3);

        const profiles = await profilesService.getAll({ start: 25 });
        expect(Array.isArray(profiles)).toBe(true);
        expect(profiles.length).toBe(1);

        expect(profiles[0]).toMatchObject({
            id: testUsers[testUsers.length - 1].id,
            email: testUsers[testUsers.length - 1].email,
            first_name: testUsers[testUsers.length - 1].user_metadata.first_name,
            last_name: testUsers[testUsers.length - 1].user_metadata.last_name,
            roles: testUsers[testUsers.length - 1].user_metadata.roles,
            waiver_accepted: false,
        });
    });

    test.each([
        { column: "email", direction: "asc" },
        { column: "email", direction: "desc" },
        { column: "created_at", direction: "asc" },
        { column: "created_at", direction: "desc" },
    ])("getAll should get profiles sorted by $column in $direction order", async ({ column, direction }) => {
        expect.assertions(2);

        const profiles = await profilesService.getAll({ sort: { [column]: direction } });
        expect(Array.isArray(profiles)).toBe(true);
        let inOrder = true;
        for (let i = 1; i < profiles.length; i++) {
            const thisProfileValue = profiles[i][column as keyof Profile]!;
            const prevProfile = profiles[i - 1][column as keyof Profile]!;
            if (direction === "asc" && thisProfileValue < prevProfile) {
                inOrder = false;
                break;
            }
            if (direction === "desc" && thisProfileValue > prevProfile) {
                inOrder = false;
                break;
            }
        }
        expect(inOrder).toBe(true);
    });

    test("getAll should raise an error on any database error", async () => {
        expect.assertions(1);
        await expect(profilesService.getAll({ count: -1 })).rejects.toThrow(DatabaseError);
    });

    test("updateWaiverAccepted should update the waiver_accepted field", async () => {
        expect.assertions(2);

        const user = testUsers[0];

        const acceptedTrueProfile = await profilesService.updateWaiverAccepted(user.id, true);
        expect.assert(acceptedTrueProfile);
        expect(acceptedTrueProfile.waiver_accepted).toBe(true);

        const acceptedFalseProfile = await profilesService.updateWaiverAccepted(user.id, false);
        expect.assert(acceptedFalseProfile);
        expect(acceptedFalseProfile.waiver_accepted).toBe(false);
    });

    test("updateWaiverAccepted should return null if profile not found", async () => {
        expect.assertions(1);
        const nonExistentId = "00000000-0000-0000-0000-000000000000";
        expect(await profilesService.updateWaiverAccepted(nonExistentId, true)).toBeNull();
    });

    test("updateWaiverAccepted should raise an error on any database error", async () => {
        expect.assertions(1);
        const badId = "invalid-uuid";
        await expect(profilesService.updateWaiverAccepted(badId, true)).rejects.toThrow(DatabaseError);
    });
});