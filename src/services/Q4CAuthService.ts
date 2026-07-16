/**
 *  Q4CAuthService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { User } from '@digitalaidseattle/core';
import { SupabaseAuthService, SupabaseConfiguration } from '@digitalaidseattle/supabase';
import { AuthTokenResponsePassword, SupabaseClient } from '@supabase/supabase-js';

type UserMetadata = User["user_metadata"] & Record<string, unknown>;

function getMetadataRoles(roles: unknown): string[] {
    if (!Array.isArray(roles)) {
        return [];
    }

    return [...new Set(
        roles
            .filter((role): role is string => typeof role === 'string')
            .map((role) => role.trim().toLowerCase())
            .filter((role) => role.length > 0)
    )].sort();
}

/**
 * Q4CAuthService is a subclass of SupabaseAuthService that provides a method to sign in with email and password.
 * Email isn't considered an OAuth provider.
 */
export class Q4CAuthService extends SupabaseAuthService {

    private static q4cInstance: Q4CAuthService;

    static getInstance(): Q4CAuthService {
        if (!Q4CAuthService.q4cInstance) {
            Q4CAuthService.q4cInstance = new Q4CAuthService(
                SupabaseConfiguration.getInstance().getSupabaseClient()
            );
        }
        return Q4CAuthService.q4cInstance;
    }

    private constructor(supabaseClient: SupabaseClient) {
        super(supabaseClient);
    }

    /**
     * Return a DAS core user with roles sourced from the active Supabase session.
     * Supabase user_metadata is client-editable, so it must not drive
     * authorization decisions. Using the active session keeps route checks
     * aligned with the JWT claims used by Supabase RLS.
     */
    getUser = async (): Promise<User | null> => {
        const response = await this.client.auth.getSession();
        const supabaseUser = response.data.session?.user;

        if (!supabaseUser) {
            return null;
        }

        const userMetadata = supabaseUser.user_metadata as Record<string, unknown>;
        const roles = getMetadataRoles(supabaseUser.app_metadata?.roles);

        return {
            email: supabaseUser.email ?? String(userMetadata.email ?? ''),
            user_metadata: {
                ...userMetadata,
                email: supabaseUser.email ?? String(userMetadata.email ?? ''),
                roles,
            } as UserMetadata,
        };
    };

    isAuthorized(user: User, authorizedRoles: string[]): boolean {
        const normalizedAuthorizedRoles = authorizedRoles.map((role) => role.trim().toLowerCase());

        return user.user_metadata.roles?.some((role) => normalizedAuthorizedRoles.includes(role)) ?? false;
    }

    /**
     * Sign in with email and password.
     * Note: Check for error by checking if error field of response is not null. \
     * Error is generic and doesn't tell if user exists, if password is incorrect, if user has password etc.
     * @param email - The email of the user to sign in with.
     * @param password - The password of the user to sign in with.
     * @returns A promise that resolves to the authentication token response.
     */
    async signInWithEmail(email: string, password: string): Promise<AuthTokenResponsePassword> {
        return this.client.auth.signInWithPassword({ email, password });
    }
}
