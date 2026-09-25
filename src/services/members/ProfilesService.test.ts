import { Profile, ProfilesDao } from "./ProfilesDao";
import { ProfilesService } from "./ProfilesService";

describe("ProfilesService unit tests", () => {
    let service: ProfilesService;
    let mockDao = {
        update: vi.fn(),
        upsert: vi.fn(),
        findBy: vi.fn(),
        searchBy: vi.fn(),
        getByOverlappingRoles: vi.fn(),
    } as unknown as ProfilesDao;

    beforeAll(() => {
        service = new ProfilesService(mockDao);
    });

    test("update should strip id, auth_id, and roles but keep status", async () => {
        expect.assertions(1);

        const updateData: Partial<Profile> = {
            id: "mock-profiles-uuid",
            auth_id: "mock-users-uuid",
            email: "keep@example.org",
            phone: "7605555555",
            roles: ["member", "admin"],
            waiver_accepted: true,
            status: "inactive"
        }

        await service.update("mock-uuid", updateData);

        expect(mockDao.update).toHaveBeenCalledWith("mock-uuid", {
            email: updateData.email,
            phone: updateData.phone,
            waiver_accepted: updateData.waiver_accepted,
            status: updateData.status
        }, undefined)
    });

    test("updateStatus calls dao.update with just the status", async () => {
        expect.assertions(1);

        await service.updateStatus("mock-uuid", "inactive");

        expect(mockDao.update).toHaveBeenCalledWith("mock-uuid", { status: "inactive" }, undefined)
    });

    test("upsert should strip roles", async () => {
        const profileData: Profile = {
            id: "mock-profiles-uuid",
            auth_id: "mock-users-uuid",
            name: "Test Profile",
            first_name: "Test",
            last_name: "Profile",
            email: "keep@example.org",
            phone: "7605555555",
            roles: ["member", "admin"],
            waiver_accepted: true,
            status: "active"
        }

        await service.upsert(profileData);

        expect(mockDao.upsert).toHaveBeenCalledWith({
            id: profileData.id,
            auth_id: profileData.auth_id,
            name: profileData.name,
            first_name: profileData.first_name,
            last_name: profileData.last_name,
            email: profileData.email,
            phone: profileData.phone,
            waiver_accepted: profileData.waiver_accepted,
            status: profileData.status
        }, undefined)
    });

    test("getByUid() - empty", async () => {
        const findBySpy = vitest.spyOn(mockDao, 'findBy').mockResolvedValue([]);
        return service.getByAuthId('test_uid')
            .then(result => {
                expect(findBySpy).toHaveBeenCalledWith('auth_id', 'test_uid');
                expect(result).toBe(null);
            })
    });

    test("getByUid() - handling", async () => {
        const profile = {} as Profile;
        const findBySpy = vitest.spyOn(mockDao, 'findBy').mockResolvedValue([profile]);
        return service.getByAuthId('test_uid')
            .then(result => {
                expect(findBySpy).toHaveBeenCalledWith('auth_id', 'test_uid');
                expect(result).toBe(profile);
            })
    });

    test("getByUid() - handling", async () => {
        const profile1 = { id: 'id_1' } as Profile;
        const profile2 = { id: 'id_2' } as Profile;
        const findBySpy = vitest.spyOn(mockDao, 'findBy').mockResolvedValue([profile1, profile2]);
        return service.getByAuthId('test_uid')
            .catch(err => {
                expect(findBySpy).toHaveBeenCalledWith('auth_id', 'test_uid');
                expect(err.message).toBe('More than one profile found with auth_id= test_uid')
            })
    });

    test("findBy() delegates to dao.findBy and returns its results", async () => {
        const profile = { id: 'id_1', email: 'test@example.org' } as Profile;
        vi.mocked(mockDao.findBy).mockResolvedValue([profile]);

        const result = await service.findBy('email', 'test@example.org');

        expect(mockDao.findBy).toHaveBeenCalledWith('email', 'test@example.org');
        expect(result).toEqual([profile]);
    });

    test("findBy() returns empty array when no matches", async () => {
        vi.mocked(mockDao.findBy).mockResolvedValue([]);

        const result = await service.findBy('name', 'nobody');

        expect(mockDao.findBy).toHaveBeenCalledWith('name', 'nobody');
        expect(result).toEqual([]);
    });

    test("findBy() propagates dao errors", async () => {
        vi.mocked(mockDao.findBy).mockRejectedValue(new Error('Unexpected error during select'));

        await expect(service.findBy('email', 'x')).rejects.toThrow('Unexpected error during select');
    });

    test("searchBy() delegates to dao.searchBy and returns its results", async () => {
        const profile1 = { id: 'id_1', name: 'jane doe' } as Profile;
        const profile2 = { id: 'id_2', name: 'jane smith' } as Profile;
        vi.mocked(mockDao.searchBy).mockResolvedValue([profile1, profile2]);

        const result = await service.searchBy('name', '%jane%');

        expect(mockDao.searchBy).toHaveBeenCalledWith('name', '%jane%');
        expect(result).toEqual([profile1, profile2]);
    });

    test("searchBy() returns empty array when no matches", async () => {
        vi.mocked(mockDao.searchBy).mockResolvedValue([]);

        const result = await service.searchBy('name', '%nobody%');

        expect(mockDao.searchBy).toHaveBeenCalledWith('name', '%nobody%');
        expect(result).toEqual([]);
    });

    test("searchBy() propagates dao errors", async () => {
        vi.mocked(mockDao.searchBy).mockRejectedValue(new Error('Unexpected error during select'));

        await expect(service.searchBy('name', '%x%')).rejects.toThrow('Unexpected error during select');
    });

    test("empty()", async () => {
        const result = service.empty();
        expect(result).toStrictEqual(
            {
                id: undefined,
                auth_id: undefined,
                name: "",
                email: "",
                first_name: "",
                last_name: "",
                phone: "",
                roles: [],
                waiver_accepted: false,
                status: "active"
            }
        )
    });

    test("getInstructorCandidates queries overlapping volunteer/instructor/admin roles and sorts by label", async () => {
        const admin = {
            id: "admin",
            name: "Admin User",
            email: "admin@example.org",
            roles: ["admin"],
        } as Profile;
        const volunteer = {
            id: "vol",
            name: "Zoe Volunteer",
            email: "zoe@example.org",
            roles: ["volunteer"],
        } as Profile;
        const instructor = {
            id: "inst",
            name: "Alex Instructor",
            email: "alex@example.org",
            roles: ["instructor"],
        } as Profile;

        vi.mocked(mockDao.getByOverlappingRoles).mockResolvedValue([admin, volunteer, instructor]);

        const result = await service.getInstructorCandidates();

        expect(mockDao.getByOverlappingRoles).toHaveBeenCalledWith(["volunteer", "instructor", "admin"]);
        expect(result.map((profile) => profile.id)).toEqual(["admin", "inst", "vol"]);
    });


});
