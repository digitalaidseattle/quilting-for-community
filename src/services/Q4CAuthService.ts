/**
 *  Q4CAuthService.ts
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import { SupabaseAuthService, SupabaseConfiguration } from '@digitalaidseattle/supabase';
import { AuthTokenResponsePassword, SupabaseClient } from '@supabase/supabase-js';

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
