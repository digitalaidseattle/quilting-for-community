# QUIL-37 Profile Authorization

This note records the authorization decision implemented for profile management.

## Role source of truth

- Canonical authorization roles live in `auth.users.raw_app_meta_data.roles`.
- Supabase app metadata is used because clients can update `user_metadata`, but cannot self-edit `app_metadata`.
- `public.profiles.roles` remains as a display/cache copy for admin profile screens and data-access convenience.
- Database RLS helpers read roles from JWT `app_metadata.roles` through `public.current_user_roles()`.

## Allowed roles

The current allowed role set is:

- `participant`
- `volunteer`
- `instructor`
- `admin`

Roles are additive and do not imply a hierarchy. New accounts default to `participant` when no supported role is supplied by trusted app metadata, ensuring every account has at least one product role. Existing missing, empty, malformed, or unsupported-only app-metadata role arrays are normalized to `participant` by the QUIL-37 migration. Non-object app metadata is repaired to an object before canonical roles are written. Client-editable user metadata is never used for this defaulting or backfill.

## Role assignment behavior

- Role assignment must go through `public.set_user_roles(target_user_id uuid, new_roles text[])`.
- `public.set_user_roles` requires the caller to have the `admin` role.
- The function requires at least one valid role, updates `auth.users.raw_app_meta_data.roles`, and syncs `public.profiles.roles`.
- Direct edits to `public.profiles.roles` are blocked by a trigger so the profile cache cannot drift from auth app metadata.
- Frontend route checks and database RLS both use the active session JWT role claims, so role changes take effect after the affected user refreshes their Supabase session or signs in again.

## First-administrator bootstrap

- Create or sign in as the intended administrator so an Auth user exists.
- Copy that user's UUID from Supabase Auth.
- As the database owner, replace the `NULL` target in `supabase/snippets/set-user-as-admin.sql` with that UUID and run the block once.
- The block fails and rolls back when the UUID is unchanged, the Auth user is missing, or the profile cache does not synchronize.
- The affected administrator must refresh their Supabase session or sign in again before the `admin` JWT claim is available.
- After the first administrator exists, use `public.set_user_roles(...)` rather than the owner-only bootstrap block.

## Profile RLS strategy

- Authenticated users can read their own profile.
- Admins can read all profiles.
- Authenticated users can update their own profile row, but cannot change roles directly.
- Admins can insert, update, and delete profile rows, but role changes still go through `public.set_user_roles`.
- Existing event-management admin RLS now uses the same app-metadata-backed `public.is_admin()` helper.
- `anon` has no table privileges on profiles, events, or event sessions; `authenticated` receives only the DML privileges that their RLS policies govern.
