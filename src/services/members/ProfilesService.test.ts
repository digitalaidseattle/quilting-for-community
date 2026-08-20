import { Profile, ProfilesDao } from "./ProfilesDao";
import { ProfilesService } from "./ProfilesService";

describe("ProfilesService unit tests", () => {
    let service: ProfilesService;
    let mockDao = {
        update: vi.fn(),
        upsert: vi.fn()
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
});