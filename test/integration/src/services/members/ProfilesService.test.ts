import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { Profile, ProfilesDao } from "../../../../../src/services/members/ProfilesDao";
import { ProfilesService } from "../../../../../src/services/members/ProfilesService";
import process from "node:process";
import { SupabaseConfiguration } from "@digitalaidseattle/supabase";
import { beforeAll } from "vitest";
import { Identifier } from "@digitalaidseattle/core";

// client for creating and deleting test users
const serviceRoleClient = createClient(
    "http://localhost:54321",
    process.env.SUPABASE_SECRET_KEY || "undefined"
);

SupabaseConfiguration.props({
    supabaseUrl: "http://localhost:54321",
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || "undefined"
})

const createTestUser = async (prefix?: string, roles: string[] = ["member"]) => {
    const dataPrefix = prefix || "";

    const { data, error } = await serviceRoleClient.auth.admin.createUser({
        email: `PROFILE_SERVICE_TEST${dataPrefix}_${Date.now()}@example.com`,
        password: "password",
        email_confirm: true,
        user_metadata: {
            first_name: `Test${dataPrefix}`,
            last_name: `User${dataPrefix}`,
            phone: "1234567890",
        },
        app_metadata: {
            roles
        }
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

const createLoginlessProfile = async (suffix: string) => {
    const { data, error } = await serviceRoleClient
        .from("profiles")
        .insert({
            email: `PROFILE_SERVICE_TEST_NOLOGIN_${suffix}_${Date.now()}@example.com`,
            name: `Nologin ${suffix}`,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
};

describe("ProfilesService", () => {
    const testUsers: User[] = [];
    const testProfiles: {[key: string]: string} = {};  // map user id to profile id

    beforeAll(async () => {
        // Clean up any test profiles created in previous tests
        const { data: cleanUpProfiles, error: cleanUpError } = await serviceRoleClient
            .from("profiles")
            .select("id, auth_id")
            .ilike("email", "PROFILE_SERVICE_TEST_%");

        if (cleanUpError) {
            console.error("Error getting test profiles for cleanup: ", cleanUpError);
        }

        if (cleanUpProfiles && cleanUpProfiles.length > 0) {
            for (const profile of cleanUpProfiles) {
                if (profile.auth_id) {
                    await serviceRoleClient.auth.admin.deleteUser(profile.auth_id);
                }

                await serviceRoleClient
                    .from("profiles")
                    .delete()
                    .eq("id", profile.id);
            }
        }

        for (let i = 0; i < 26; i++) {
            const user = await createTestUser(`_${String(i).padStart(2, '0')}`);
            testUsers.push(user);
        }

        // load profiles as well, should have been created with new users
        const { data, error } = await serviceRoleClient
            .from("profiles")
            .select("id, auth_id");

        if (error) {
            console.error("Error getting new profiles: ", error);
        }

        if (data && data.length > 0) {
            for (const profile of data) {
                // key by user id
                testProfiles[profile.auth_id] = profile.id;
            }
        }
    });

    describe("smoke tests (bypass RLS)", async () => {
        let serviceRoleProfileService: ProfilesService;

        beforeAll(async () => {
            serviceRoleProfileService = new ProfilesService(new ProfilesDao(
                serviceRoleClient,
                "profiles",
                { select: "*" }
            ))
        });

        test("getById should return a profile", async () => {
            expect.assertions(1);

            const testUser = testUsers[0];
            const profileId = testProfiles[testUser.id];

            const profile = await serviceRoleProfileService.getById(profileId);
            const { data: expectedProfile } = await serviceRoleClient
                .from("profiles")
                .select()
                .eq("id", profileId)
                .single();
            expect(profile).toMatchObject(expectedProfile);
        });

        test("getByAuthId should return a profile for a user if found", async () => {
            expect.assertions(1);

            const testUser = testUsers[0];

            const profile = await serviceRoleProfileService.getByAuthId(testUser.id);
            const { data: expectedProfile } = await serviceRoleClient
                .from("profiles")
                .select()
                .eq("auth_id", testUser.id)
                .single();
            expect(profile).toMatchObject(expectedProfile);
        });

        test("getByAuthId should return null if not found", async () => {
            expect.assertions(1);

            // need to use a valid UUID
            const profile = await serviceRoleProfileService.getByAuthId("00000000-0000-0000-0000-000000000000");
            expect(profile).toBeNull();
        });

        test("getByAuthId should throw an error for any unexpected errors", async () => {
            expect.assertions(1);

            await expect(serviceRoleProfileService.getByAuthId("bad-uuid")).rejects.toThrow(Error);
        });

        test("update should update any profile", async () => {
            const user = testUsers[0];
            const profileId = testProfiles[user.id];
            const updateLastName = "FoobarService";

            const profile = await serviceRoleProfileService.update(profileId, {
                last_name: updateLastName
            });
            const { data: expectedProfile } = await serviceRoleClient
                .from("profiles")
                .select()
                .eq("id", profileId)
                .single();
            expect(profile).toMatchObject(expectedProfile);
        });

        test("profile survives auth user deletion with auth_id set to null", async () => {
            expect.assertions(2);

            const user = await createTestUser("_DELCASCADE");
            const { data: profileBefore } = await serviceRoleClient
                .from("profiles")
                .select("id")
                .eq("auth_id", user.id)
                .single();

            await serviceRoleClient.auth.admin.deleteUser(user.id);

            const { data: profileAfter } = await serviceRoleClient
                .from("profiles")
                .select("id, auth_id")
                .eq("id", profileBefore!.id)
                .single();

            expect(profileAfter).not.toBeNull();
            expect(profileAfter?.auth_id).toBeNull();
        });

        test("login-less profile can be created directly with a null auth_id", async () => {
            expect.assertions(2);

            const profile = await createLoginlessProfile("A");

            expect(profile.auth_id).toBeNull();
            expect(profile.id).toBeDefined();
        });

        test("multiple login-less profiles can coexist", async () => {
            expect.assertions(2);

            const first = await createLoginlessProfile("B1");
            const second = await createLoginlessProfile("B2");

            expect(first.id).not.toEqual(second.id);
            expect(second.auth_id).toBeNull();
        });

        test("a new auth user yields exactly one profile with a distinct id", async () => {
            expect.assertions(3);

            const user = await createTestUser("_TRIGGERONE");
            const { data: profiles } = await serviceRoleClient
                .from("profiles")
                .select("id, auth_id")
                .eq("auth_id", user.id);

            expect(profiles).toHaveLength(1);
            expect(profiles![0].auth_id).toEqual(user.id);
            expect(profiles![0].id).not.toEqual(user.id);
        });

        test("an auth email change syncs profiles.email", async () => {
            expect.assertions(1);

            const user = await createTestUser("_TRIGGEREMAIL");
            const newEmail = `PROFILE_SERVICE_TEST_TRIGGEREMAIL_UPDATED_${Date.now()}@example.com`;

            await serviceRoleClient.auth.admin.updateUserById(user.id, { email: newEmail });

            const { data: profile } = await serviceRoleClient
                .from("profiles")
                .select("email")
                .eq("auth_id", user.id)
                .single();

            // Supabase Auth lowercases emails, and the trigger syncs profiles.email from auth.users.email
            expect(profile?.email).toEqual(newEmail.toLowerCase());
        });

        test("a login-only auth update does not stomp profile edits", async () => {
            expect.assertions(1);

            const user = await createTestUser("_TRIGGERLOGINONLY");
            const { data: profile } = await serviceRoleClient
                .from("profiles")
                .select("id")
                .eq("auth_id", user.id)
                .single();

            await serviceRoleProfileService.update(profile!.id, { name: "Edited Name" });

            // signing in updates auth.users (e.g. last_sign_in_at) without touching
            // email or user_metadata, exercising the is_login_only_update guard
            const client = createClient(
                "http://localhost:54321",
                process.env.VITE_SUPABASE_ANON_KEY || "undefined"
            );
            await client.auth.signInWithPassword({ email: user.email!, password: "password" });

            const { data: profileAfter } = await serviceRoleClient
                .from("profiles")
                .select("name")
                .eq("id", profile!.id)
                .single();

            expect(profileAfter?.name).toEqual("Edited Name");
        });

        test("find pages and sorts profiles scoped by a filter", async () => {
            expect.assertions(2);

            const { rows, totalRowCount } = await serviceRoleProfileService.find({
                page: 0,
                pageSize: 10,
                sortField: "email",
                sortDirection: "asc",
                filterModel: {
                    items: [{ field: "email", operator: "startsWith", value: "PROFILE_SERVICE_TEST_" }],
                },
            });

            expect(totalRowCount).toBeGreaterThanOrEqual(26);
            expect(rows).toHaveLength(10);
        });

        test("upsert updates an existing profile and leaves roles untouched", async () => {
            expect.assertions(2);

            const profileId = testProfiles[testUsers[1].id];
            const { data: before } = await serviceRoleClient
                .from("profiles")
                .select("roles")
                .eq("id", profileId)
                .single();

            const updated = await serviceRoleProfileService.upsert({
                id: profileId,
                last_name: "Upserted",
                roles: ["admin"],
            });

            expect(updated.last_name).toEqual("Upserted");
            expect(updated.roles).toEqual(before?.roles);
        });
    });

    describe("as admin user", () => {
        let adminUser: User;
        let supabaseClient: SupabaseClient;
        let adminProfileService: ProfilesService;

        beforeAll(async () => {
            adminUser = await createTestUser("_ZZZadmin", ["admin"]);

            supabaseClient = createClient(
                "http://localhost:54321",
                process.env.VITE_SUPABASE_ANON_KEY || "undefined"
            );

            await supabaseClient.auth.signInWithPassword({email: adminUser.email!, password: "password"});
            adminProfileService = new ProfilesService(new ProfilesDao(
                supabaseClient,
                "profiles",
                { select: "*" }
            ));
        });

        test("getById should return a single profile", async () => {
            expect.assertions(1);

            const profileId = testProfiles[testUsers[0].id]; 

            const profile = await adminProfileService.getById(profileId);
            const { data: expectedProfile } = await supabaseClient
                .from("profiles")
                .select()
                .eq("id", profileId)
                .single();
            expect(profile).toMatchObject(expectedProfile);
        });

        test("update should update any profile", async () => {
            const profileId = testProfiles[testUsers[0].id];
            const updateLastName = "FoobarAdmin";

            const profile = await adminProfileService.update(profileId, {
                last_name: updateLastName
            });
            const { data: expectedProfile } = await supabaseClient
                .from("profiles")
                .select()
                .eq("id", profileId)
                .single();
            expect(profile).toMatchObject(expectedProfile);
        });

        test("an admin can create a login-less profile through an authenticated client", async () => {
            expect.assertions(2);

            // cast as Profile here so we can omit id/auth_id/roles: id gets an
            // auto-generated value, and auth_id/roles are never client-insertable
            // (auth_id would let an admin backdoor-link a profile; roles is
            // set_user_roles-only), so they're left as their column defaults.
            const profile = await adminProfileService.insert({
                name: "Login-less Profile",
                email: `PROFILE_SERVICE_TEST_NOLOGIN_ADMIN_${Date.now()}@example.com`,
                phone: "",
                waiver_accepted: false
            } as Profile);

            expect(profile.id).not.toBeNull();
            expect(profile.auth_id).toBeNull();
        });

        test("getById and update work on a login-less profile", async () => {
            expect.assertions(2);

            const profile = await createLoginlessProfile("GETUPDATE");

            const fetched = await adminProfileService.getById(profile.id);
            expect(fetched?.auth_id).toBeNull();

            const updated = await adminProfileService.update(profile.id, { last_name: "Loginless" });
            expect(updated.last_name).toEqual("Loginless");
        });

        test("email is editable on a login-less profile", async () => {
            expect.assertions(1);

            const profile = await createLoginlessProfile("EMAIL");
            const newEmail = `PROFILE_SERVICE_TEST_NOLOGIN_EMAIL_UPDATED_${Date.now()}@example.com`;

            const updated = await adminProfileService.update(profile.id, { email: newEmail });
            expect(updated.email).toEqual(newEmail);
        });
    });

    describe("as a non-admin user", () => {
        let nonAdminUser: User;
        let nonAdminProfileId: Identifier;
        let supabaseClient: SupabaseClient;
        let nonAdminProfileService: ProfilesService;

        beforeAll(async () => {
            nonAdminUser = await createTestUser("_ZZZmember", ["member"]);
            supabaseClient = createClient(
                "http://localhost:54321",
                process.env.VITE_SUPABASE_ANON_KEY || "undefined"
            );

            await supabaseClient.auth.signInWithPassword({email: nonAdminUser.email!, password: "password"});
            nonAdminProfileService = new ProfilesService(new ProfilesDao(
                supabaseClient,
                "profiles",
                { select: "*" }
            ));

            const { data } = await supabaseClient
                .from("profiles")
                .select("id")
                .eq("auth_id", nonAdminUser.id)
                .single();

            nonAdminProfileId = data?.id
        });

        test("update should update own profile", async () => {
            const updateLastName = "NonAdmin"

            const profile = await nonAdminProfileService.update(nonAdminProfileId, {
                last_name: updateLastName
            });
            const { data: expectedProfile } = await supabaseClient
                .from("profiles")
                .select()
                .eq("auth_id", nonAdminUser.id)
                .single();
            expect(profile).toMatchObject(expectedProfile);
        });

        test("update should fail on another profile", async () => {
            const profileId = testProfiles[testUsers[0].id];
            await expect(nonAdminProfileService.update(profileId, { name: "Fail" })).rejects.toThrow(Error);
        });

        test("cannot escalate own roles via update", async () => {
            expect.assertions(2);

            const updated = await nonAdminProfileService.update(nonAdminProfileId, {
                last_name: "Escalated",
                roles: ["admin"],
            });

            expect(updated.last_name).toEqual("Escalated");
            expect(updated.roles).not.toContain("admin");
        });

        test("cannot update a login-less profile", async () => {
            expect.assertions(1);

            const profile = await createLoginlessProfile("PRIVBOUNDARY");

            await expect(
                nonAdminProfileService.update(profile.id, { last_name: "Hacked" })
            ).rejects.toThrow(Error);
        });

        test("cannot insert a profile", async () => {
            expect.assertions(1);

            const { error } = await supabaseClient
                .from("profiles")
                .insert({
                    email: `PROFILE_SERVICE_TEST_NOLOGIN_DENY_${Date.now()}@example.com`,
                    name: "Should Not Insert",
                });

            expect(error).not.toBeNull();
        });

        test("cannot delete a profile", async () => {
            expect.assertions(1);

            const targetId = testProfiles[testUsers[0].id];

            await supabaseClient
                .from("profiles")
                .delete()
                .eq("id", targetId);

            const { data: stillThere } = await serviceRoleClient
                .from("profiles")
                .select("id")
                .eq("id", targetId)
                .single();

            expect(stillThere).not.toBeNull();
        });
    });
});