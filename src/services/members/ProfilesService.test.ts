import { Profile, ProfilesDao } from "./ProfilesDao";
import { ProfilesService } from "./ProfilesService";

describe("ProfilesService unit tests", () => {
    let service: ProfilesService;
    let mockDao = {
        update: vi.fn(),
        upsert: vi.fn(),
        findBy: vi.fn()
        getByOverlappingRoles: vi.fn(),
    } as unknown as ProfilesDao;

    beforeAll(() => {
        service = new ProfilesService(mockDao);
    });

    test("update should strip id, uid, and roles", async () => {
        expect.assertions(1);

        const updateData: Partial<Profile> = {
            id: "mock-profiles-uuid",
            uid: "mock-users-uuid",
            email: "keep@example.org",
            phone: "7605555555",
            roles: ["member", "admin"],
            waiver_accepted: true
        }

        await service.update("mock-uuid", updateData);

        expect(mockDao.update).toHaveBeenCalledWith("mock-uuid", {
            email: updateData.email,
            phone: updateData.phone,
            waiver_accepted: updateData.waiver_accepted
        }, undefined)
    });

    test("upsert should strip roles", async () => {
        const profileData: Profile = {
            id: "mock-profiles-uuid",
            uid: "mock-users-uuid",
            name: "Test Profile",
            first_name: "Test",
            last_name: "Profile",
            email: "keep@example.org",
            phone: "7605555555",
            roles: ["member", "admin"],
            waiver_accepted: true
        }

        await service.upsert(profileData);

        expect(mockDao.upsert).toHaveBeenCalledWith({
            id: profileData.id,
            uid: profileData.uid,
            name: profileData.name,
            first_name: profileData.first_name,
            last_name: profileData.last_name,
            email: profileData.email,
            phone: profileData.phone,
            waiver_accepted: profileData.waiver_accepted
        }, undefined)
    });

    test("getByUid() - empty", async () => {
        const findBySpy = vitest.spyOn(mockDao, 'findBy').mockResolvedValue([]);
        service.getByUid('test_uid')
            .then(result => {
                expect(findBySpy).toHaveBeenCalledWith('uid', 'test_uid');
                expect(result).toBe(null);
            })
    });

    test("getByUid() - handling", async () => {
        const profile = {} as Profile;
        const findBySpy = vitest.spyOn(mockDao, 'findBy').mockResolvedValue([profile]);
        service.getByUid('test_uid')
            .then(result => {
                expect(findBySpy).toHaveBeenCalledWith('uid', 'test_uid');
                expect(result).toBe(profile);
            })
    });

    test("getByUid() - handling", async () => {
        const profile1 = { id: 'id_1' } as Profile;
        const profile2 = { id: 'id_2' } as Profile;
        const findBySpy = vitest.spyOn(mockDao, 'findBy').mockResolvedValue([profile1, profile2]);
        service.getByUid('test_uid')
            .catch(err => {
                expect(findBySpy).toHaveBeenCalledWith('uid', 'test_uid');
                expect(err.message).toBe('More than one profile found with uid= test_uid')
            })
    });

    test("empty()", async () => {
        const result = service.empty();
        expect(result).toStrictEqual(
            {
                id: null,
                uid: null,
                name: "",
                email: "",
                first_name: "",
                last_name: "",
                phone: "",
                roles: [],
                waiver_accepted: false
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
