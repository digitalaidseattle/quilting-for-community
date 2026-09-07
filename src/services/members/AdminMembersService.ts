/**
 *  AdminMembersService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { SupabaseConfiguration } from '@digitalaidseattle/supabase';
import { Profile } from "./ProfilesDao";

export type RegisterMemberInput = {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    roles?: string[];
    waiver_accepted?: boolean;
};

/**
 * Service for admin operations related to member management.
 */
export class AdminMembersService {
    private static instance: AdminMembersService;

    static getInstance(): AdminMembersService {
        if (!AdminMembersService.instance) {
            AdminMembersService.instance = new AdminMembersService();
        }
        return AdminMembersService.instance;
    }

    static setInstance(service: AdminMembersService) {
        AdminMembersService.instance = service;
    }

    constructor() {}

    /**
     * Register a new member by calling the register-member Edge Function.
     * The user will receive an invitation email with a password reset link.
     *
     * @param input - The member registration data
     * @returns The created profile
     * @throws If the email already exists or other errors occur
     */
    async registerMember(input: RegisterMemberInput): Promise<Profile> {
        const supabaseClient = SupabaseConfiguration.getInstance().getSupabaseClient();

        try {
            const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
            if (sessionError) {
                throw new Error(sessionError.message || 'Unable to verify your session.');
            }

            const sessionRoles = Array.isArray(sessionData?.session?.user?.app_metadata?.roles)
                ? sessionData.session.user.app_metadata.roles
                : [];
            const hasAdminRole = sessionRoles.some((role) => String(role).toLowerCase() === 'admin');

            if (!sessionData?.session || !hasAdminRole) {
                throw new Error('You must be signed in as an admin to register members.');
            }

            const { data, error } = await supabaseClient.functions.invoke('register-member', {
                body: input,
            });

            if (error) {
                throw new Error(error.message || 'Failed to register member');
            }

            if (!data?.success) {
                throw new Error(data?.error || 'Failed to register member');
            }

            // Return a minimal profile object; the full profile is created server-side
            const profile: Profile = {
                id: data.user_id,
                auth_id: data.user_id,
                name: [input.first_name, input.last_name].filter(Boolean).join(' ').trim() || input.email,
                first_name: input.first_name,
                last_name: input.last_name,
                email: data.email,
                phone: input.phone || '',
                roles: input.roles || [],
                waiver_accepted: input.waiver_accepted ?? false,
            };

            return profile;
        } catch (error) {
            console.error('Error registering member:', error);
            throw error;
        }
    }

    /**
     * Check if an email is already registered (check with the backend).
     * This is a simple validation; the Edge Function will also check.
     *
     * @param email - The email to check
     * @returns true if the email exists, false otherwise
     */
    async emailExists(email: string): Promise<boolean> {
        try {
            const supabaseClient = SupabaseConfiguration.getInstance().getSupabaseClient();
            
            // Query the profiles table directly (this requires read permissions on profiles)
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('id')
                .eq('email', email.toLowerCase())
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                throw error;
            }

            return !!data;
        } catch (error) {
            console.error('Error checking if email exists:', error);
            throw error;
        }
    }

    async searchParticipants(q: string): Promise<Profile[]> {
        try {
            const supabaseClient = SupabaseConfiguration.getInstance().getSupabaseClient();

            const like = `%${q.replace(/%/g, '')}%`;
            const orQuery = `name.ilike.${like},email.ilike.${like},phone.ilike.${like}`;

            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .or(orQuery)
                .limit(20);

            if (error) {
                throw error;
            }

            return (data ?? []).map((row: any) => ({
                id: row.id,
                auth_id: row.auth_id ?? null,
                name: row.name,
                first_name: row.first_name,
                last_name: row.last_name,
                email: row.email,
                phone: row.phone,
                roles: row.roles || [],
                waiver_accepted: !!row.waiver_accepted,
            }));
        } catch (err) {
            console.error('Error searching participants:', err);
            throw err;
        }
    }
}
