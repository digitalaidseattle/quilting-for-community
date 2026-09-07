import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { Profile, ProfilesDao } from "../../../../../src/services/members/ProfilesDao";
import { ProfilesService } from "../../../../../src/services/members/ProfilesService";
import process from "node:process";
import { SupabaseConfiguration } from "@digitalaidseattle/supabase";
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

// login-less profile ids created during a run, drained by the suite afterAll
const loginlessProfileIds: string[] = [];

const uniqueSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createTestUser = async (prefix?: string, roles: string[] = ["member"]) => {
    const dataPrefix = prefix || "";

    const { data, error } = await serviceRoleClient.auth.admin.createUser({
        email: `PROFILE_SERVICE_TEST${dataPrefix}_${uniqueSuffix()}@example.com`,
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
            email: `PROFILE_SERVICE_TEST_NOLOGIN_${suffix}_${uniqueSuffix()}@example.com`,
            name: `Nologin ${suffix}`,
        })
        .select()
        .single();
    if (error) throw error;
    loginlessProfileIds.push(data.id);
    return data;
};

/** profiles are trigger-created with their own surrogate id, so look it up */
const profileIdFor = async (authId: string): Promise<string> => {
    const { data, error } = await serviceRoleClient
        .from("profiles")
        .select("id")
        .eq("auth_id", authId)
        .single();
    if (error) throw error;
    return data.id;
};

/**
 * Deleting the auth user only nulls profiles.auth_id (FK `on delete set null`),
 * so the profile row goes first — by id, since a deletion-cascade test may have
 * already nulled auth_id by the time this runs.
 */
const destroyTestUser = async (authId: string, profileId?: string) => {
    if (profileId) {
        await serviceRoleClient.from("profiles").delete().eq("id", profileId);
    } else {
        await serviceRoleClient.from("profiles").delete().eq("auth_id", authId);
    }
    await serviceRoleClient.auth.admin.deleteUser(authId);  // no-op if already gone
};

/** Create an isolated user for a mutating test and guarantee teardown. */
const withTestUser = async (
    fn: (user: User, profileId: string) => Promise<void>,
    roles: string[] = ["member"],
) => {
    const user = await createTestUser(undefined, roles);
    const profileId = await profileIdFor(user.id);
    try {
        await fn(user, profileId);
    } finally {
        await destroyTestUser(user.id, profileId);
    }
};

describe("ProfilesService", () => {
    // shared pool for tests that only READ, or whose write is expected to be
    // rejected so nothing persists. Anything that mutates uses withTestUser.
    const readOnlyUsers: User[] = [];

    beforeAll(async () => {
        // Safety net: sweep leftovers from a run that crashed before its
        // afterAll teardown. Normal runs clean up after themselves.
        const { data: stale, error: staleError } = await serviceRoleClient
            .from("profiles")
            .select("id, auth_id")
            .ilike("email", "PROFILE_SERVICE_TEST_%");

        if (staleError) {
            console.error("Error listing stale test profiles for cleanup: ", staleError);
        }

        for (const profile of stale ?? []) {
            if (profile.auth_id) {
                await serviceRoleClient.auth.admin.deleteUser(profile.auth_id);
            }
            await serviceRoleClient.from("profiles").delete().eq("id", profile.id);
        }

        for (let i = 0; i < 3; i++) {
            readOnlyUsers.push(await createTestUser(`_POOL${i}`));
        }
    });

    afterAll(async () => {
        for (const id of loginlessProfileIds) {
            await serviceRoleClient.from("profiles").delete().eq("id", id);
        }
        for (const user of readOnlyUsers) {
            await destroyTestUser(user.id);
        }
    });

    describe("smoke tests (bypass RLS)", () => {
        let serviceRoleProfileService: ProfilesService;

        beforeAll(() => {
            serviceRoleProfileService = new ProfilesService(new ProfilesDao(
                serviceRoleClient,
                "profiles",
                { select: "*" }
            ))
        });

        test("getById should return a profile", async () => {
            expect.assertions(1);

            const profileId = await profileIdFor(readOnlyUsers[0].id);

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

            const authId = readOnlyUsers[0].id;

            const profile = await serviceRoleProfileService.getByAuthId(authId);
            const { data: expectedProfile } = await serviceRoleClient
                .from("profiles")
                .select()
                .eq("auth_id", authId)
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

        test("update should update any profile", () =>
            withTestUser(async (_user, profileId) => {
                const profile = await serviceRoleProfileService.update(profileId, {
                    last_name: "FoobarService"
                });
                expect(profile.last_name).toEqual("FoobarService");
            }));

        test("profile survives auth user deletion with auth_id and status cleared", () =>
            withTestUser(async (user, profileId) => {
                await serviceRoleClient.auth.admin.deleteUser(user.id);

                const { data: profileAfter } = await serviceRoleClient
                    .from("profiles")
                    .select("id, auth_id, status")
                    .eq("id", profileId)
                    .single();

                expect(profileAfter).not.toBeNull();
                expect(profileAfter?.auth_id).toBeNull();
                expect(profileAfter?.status).toEqual("inactive");
            }));

        test("auth_id cannot be reassigned to a different auth user", async () => {
            expect.assertions(1);

            const profileId = await profileIdFor(readOnlyUsers[1].id);

            // ProfilesService.update() strips auth_id from the payload, so this
            // goes straight through the client to exercise the DB-level guard
            // in enforce_profile_role_management().
            const { error } = await serviceRoleClient
                .from("profiles")
                .update({ auth_id: readOnlyUsers[2].id })
                .eq("id", profileId);

            expect(error).not.toBeNull();
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

        test("a new auth user yields exactly one profile with a distinct id", () =>
            withTestUser(async (user) => {
                const { data: profiles } = await serviceRoleClient
                    .from("profiles")
                    .select("id, auth_id")
                    .eq("auth_id", user.id);

                expect(profiles).toHaveLength(1);
                expect(profiles![0].auth_id).toEqual(user.id);
                expect(profiles![0].id).not.toEqual(user.id);
            }));

        test("an auth email change syncs profiles.email", () =>
            withTestUser(async (user, profileId) => {
                const newEmail = `PROFILE_SERVICE_TEST_TRIGGEREMAIL_UPDATED_${uniqueSuffix()}@example.com`;

                await serviceRoleClient.auth.admin.updateUserById(user.id, { email: newEmail });

                const { data: profile } = await serviceRoleClient
                    .from("profiles")
                    .select("email")
                    .eq("id", profileId)
                    .single();

                // Supabase Auth lowercases emails, and the trigger syncs profiles.email from auth.users.email
                expect(profile?.email).toEqual(newEmail.toLowerCase());
            }));

        test("a login-only auth update does not stomp profile edits", () =>
            withTestUser(async (user, profileId) => {
                await serviceRoleProfileService.update(profileId, { name: "Edited Name" });

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
                    .eq("id", profileId)
                    .single();

                expect(profileAfter?.name).toEqual("Edited Name");
            }));

        test("upsert updates an existing profile and leaves roles untouched", () =>
            withTestUser(async (_user, profileId) => {
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
            }));
    });

    describe("find paging", () => {
        let svc: ProfilesService;
        const marker = `PAGING_${uniqueSuffix()}`;
        const prefix = `PROFILE_SERVICE_TEST_NOLOGIN_${marker}_`;
        // the seeded emails, in ascending order — the source of truth we compare
        // the DAO's paged output against
        let sortedEmails: string[] = [];

        beforeAll(async () => {
            svc = new ProfilesService(new ProfilesDao(
                serviceRoleClient,
                "profiles",
                { select: "*" }
            ));

            const created: string[] = [];
            for (const letter of ["a", "b", "c", "d", "e", "f", "g"]) {
                // email is ..._<marker>_<letter>_<suffix>@... so the letter drives
                // sort order regardless of the trailing suffix
                const row = await createLoginlessProfile(`${marker}_${letter}`);
                created.push(row.email);
            }
            sortedEmails = [...created].sort();
        });

        const page = (p: number, dir: "asc" | "desc" = "asc") =>
            svc.find({
                page: p,
                pageSize: 3,
                sortField: "email",
                sortDirection: dir,
                filterModel: {
                    items: [{ field: "email", operator: "startsWith", value: prefix }],
                },
            });

        test("first page: exact total and the first pageSize rows", async () => {
            expect.assertions(2);

            const { rows, totalRowCount } = await page(0);

            expect(totalRowCount).toEqual(7);
            expect(rows.map((r) => r.email)).toEqual(sortedEmails.slice(0, 3));
        });

        test("second page: offset advances with no overlap", async () => {
            expect.assertions(1);

            const { rows } = await page(1);

            expect(rows.map((r) => r.email)).toEqual(sortedEmails.slice(3, 6));
        });

        test("final page is partial and the total is unaffected by paging", async () => {
            expect.assertions(2);

            const { rows, totalRowCount } = await page(2);

            expect(rows.map((r) => r.email)).toEqual(sortedEmails.slice(6));
            expect(totalRowCount).toEqual(7);
        });

        test("a page past the end throws (DAO does not guard a null range response)", async () => {
            expect.assertions(1);

            // PostgREST answers a beyond-count range with 416 and a null body,
            // and SupabaseDAO.find() does resp.data.map(...) without a guard.
            // Documenting the current behavior; if the DAO is fixed to return an
            // empty page, update this to expect { rows: [] }.
            await expect(page(3)).rejects.toThrow();
        });

        test("descending sort direction is applied", async () => {
            expect.assertions(1);

            const { rows } = await page(0, "desc");

            expect(rows.map((r) => r.email)).toEqual([...sortedEmails].reverse().slice(0, 3));
        });
    });

    describe("as admin user", () => {
        let adminUser: User;
        let supabaseClient: SupabaseClient;
        let adminProfileService: ProfilesService;

        beforeAll(async () => {
            adminUser = await createTestUser("_ADMIN", ["admin"]);

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

        afterAll(async () => {
            await destroyTestUser(adminUser.id);
        });

        test("getById should return a single profile", async () => {
            expect.assertions(1);

            const profileId = await profileIdFor(readOnlyUsers[0].id);

            const profile = await adminProfileService.getById(profileId);
            const { data: expectedProfile } = await supabaseClient
                .from("profiles")
                .select()
                .eq("id", profileId)
                .single();
            expect(profile).toMatchObject(expectedProfile);
        });

        test("update should update any profile", () =>
            withTestUser(async (_user, profileId) => {
                const profile = await adminProfileService.update(profileId, {
                    last_name: "FoobarAdmin"
                });
                expect(profile.last_name).toEqual("FoobarAdmin");
            }));

        test("an admin can create a login-less profile through an authenticated client", async () => {
            expect.assertions(2);

            // cast as Profile here so we can omit id/auth_id/roles: id gets an
            // auto-generated value, and auth_id/roles are never client-insertable
            // (auth_id would let an admin backdoor-link a profile; roles is
            // set_user_roles-only), so they're left as their column defaults.
            const profile = await adminProfileService.insert({
                name: "Login-less Profile",
                email: `PROFILE_SERVICE_TEST_NOLOGIN_ADMIN_${uniqueSuffix()}@example.com`,
                phone: "",
                waiver_accepted: false
            } as Profile);
            if (profile?.id) loginlessProfileIds.push(String(profile.id));

            expect(profile.id).not.toBeNull();
            expect(profile.auth_id).toBeNull();
        });

        test("insert cannot set auth_id or roles directly", async () => {
            expect.assertions(1);

            // the insert grant only covers name/first_name/last_name/email/phone/
            // waiver_accepted; explicitly setting auth_id here would let an admin
            // backdoor-link a profile. The DB rejects it (permission denied for
            // column auth_id), but ProfilesDao.insert() doesn't surface DB errors
            // as a rejection (see SupabaseDAO.insert), so it resolves to null.
            const profile = await adminProfileService.insert({
                name: "Backdoor Link Attempt",
                email: `PROFILE_SERVICE_TEST_NOLOGIN_BACKDOOR_${uniqueSuffix()}@example.com`,
                phone: "",
                waiver_accepted: false,
                auth_id: readOnlyUsers[0].id,
            } as Profile);

            expect(profile).toBeNull();
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
            const newEmail = `PROFILE_SERVICE_TEST_NOLOGIN_EMAIL_UPDATED_${uniqueSuffix()}@example.com`;

            const updated = await adminProfileService.update(profile.id, { email: newEmail });
            expect(updated.email).toEqual(newEmail);
        });

        test("an admin can deactivate and reactivate a profile", () =>
            withTestUser(async (_user, profileId) => {
                const deactivated = await adminProfileService.updateStatus(profileId, "inactive");
                expect(deactivated.status).toEqual("inactive");

                const reactivated = await adminProfileService.updateStatus(profileId, "active");
                expect(reactivated.status).toEqual("active");
            }));
    });

    describe("as a non-admin user", () => {
        let nonAdminUser: User;
        let nonAdminProfileId: Identifier;
        let supabaseClient: SupabaseClient;
        let nonAdminProfileService: ProfilesService;

        beforeAll(async () => {
            nonAdminUser = await createTestUser("_MEMBER", ["member"]);
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

        afterAll(async () => {
            await destroyTestUser(nonAdminUser.id);
        });

        test("update should update own profile", async () => {
            expect.assertions(1);

            const profile = await nonAdminProfileService.update(nonAdminProfileId, {
                last_name: "NonAdmin"
            });
            expect(profile.last_name).toEqual("NonAdmin");
        });

        test("select is scoped to own profile only", async () => {
            expect.assertions(2);

            // profiles_non_admin_read (using (true)) used to make this return
            // every profile; profiles_select_own_or_admin should now scope it.
            const { data, error } = await supabaseClient
                .from("profiles")
                .select("id");

            expect(error).toBeNull();
            expect(data).toEqual([{ id: nonAdminProfileId }]);
        });

        test("update should fail on another profile", async () => {
            expect.assertions(1);

            const profileId = await profileIdFor(readOnlyUsers[0].id);
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

        test("cannot deactivate own profile via update", async () => {
            expect.assertions(2);

            const updated = await nonAdminProfileService.update(nonAdminProfileId, {
                last_name: "StatusCombo",
                status: "inactive",
            });

            // the DB silently reverts a non-admin's status edit, same as roles
            expect(updated.last_name).toEqual("StatusCombo");
            expect(updated.status).toEqual("active");
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
                    email: `PROFILE_SERVICE_TEST_NOLOGIN_DENY_${uniqueSuffix()}@example.com`,
                    name: "Should Not Insert",
                });

            expect(error).not.toBeNull();
        });

        test("cannot delete a profile", async () => {
            expect.assertions(1);

            const targetId = await profileIdFor(readOnlyUsers[0].id);

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
