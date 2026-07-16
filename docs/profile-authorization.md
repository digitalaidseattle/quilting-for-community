# QUIL-37 Profile Authorization

This note records the authorization decision implemented for profile management.

## Role source of truth

- Canonical authorization roles live in `auth.users.raw_app_meta_data.roles`.
- Supabase app metadata is used because clients can update `user_metadata`, but cannot self-edit `app_metadata`.
- `public.profiles.roles` remains as a display/cache copy for admin profile screens and data-access convenience.
- Database RLS helpers read roles from JWT `app_metadata.roles` through `public.current_user_roles()`.

## Allowed roles

The current allowed role set is:

- `user`
- `participant`
- `volunteer`
- `instructor`
- `admin`

`user` is retained for compatibility with earlier profile-management work. The product-facing concepts are participant, volunteer, instructor, and administrator.

## Role assignment behavior

- Role assignment must go through `public.set_user_roles(target_user_id uuid, new_roles text[])`.
- `public.set_user_roles` requires the caller to have the `admin` role.
- The function validates roles, updates `auth.users.raw_app_meta_data.roles`, and syncs `public.profiles.roles`.
- Direct edits to `public.profiles.roles` are blocked by a trigger so the profile cache cannot drift from auth app metadata.
- Frontend route checks and database RLS both use the active session JWT role claims, so role changes take effect after the affected user refreshes their Supabase session or signs in again.

## Profile RLS strategy

- Authenticated users can read their own profile.
- Admins can read all profiles.
- Authenticated users can update their own profile row, but cannot change roles directly.
- Admins can insert, update, and delete profile rows, but role changes still go through `public.set_user_roles`.
- Existing event-management admin RLS now uses the same app-metadata-backed `public.is_admin()` helper.
