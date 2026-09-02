# Admin Member Registration Feature

This feature allows admins to register new members in the system.

## Overview

Admins can now register new members through a dedicated admin interface at `/members`. The registration process:

1. Admin enters member details (email, name, phone, roles)
2. A new auth user is created with the provided email
3. An invitation email is sent to the member with a password reset link
4. Member receives email and sets their own password
5. Member's profile is created in the database

## Components

### Services

**`AdminMembersService`** (`src/services/members/AdminMembersService.ts`)
- Handles member registration logic
- Communicates with the `register-member` Edge Function
- Validates email addresses and checks for duplicates

### Pages

**`AdminMembersPage`** (`src/pages/admin/AdminMembersPage.tsx`)
- Main admin members management interface
- Displays list of all members
- Provides button to register new members
- Shows member details (name, email, phone, roles)

### Dialogs

**`MemberRegistrationDialog`** (`src/pages/admin/MemberRegistrationDialog.tsx`)
- Modal dialog for registering new members
- Form fields for email (required), first name, last name, phone, and roles
- Client-side validation
- Error handling and user feedback

## Supabase Edge Function

**`register-member`** (`supabase/functions/register-member/index.ts`)
- Creates new Supabase auth user with service role privileges
- Validates email format and checks for duplicates
- Sends password reset email
- Updates member profile with provided information

### Deployment

To deploy the Edge Function:

```bash
supabase functions deploy register-member
```

## Registration Flow

```
Admin -> Opens Members Page -> Clicks "Register Member"
   ↓
MemberRegistrationDialog opens
   ↓
Admin fills in member details
   ↓
Form validation (client-side)
   ↓
AdminMembersService.registerMember() called
   ↓
Edge Function: register-member invoked
   ↓
Edge Function: Validates email, creates auth user, sends email
   ↓
Member receives invitation email with password reset link
   ↓
Member clicks link and sets password
   ↓
Member can now log in
```

## Features

✅ Email validation (format check)
✅ Duplicate email detection
✅ Automatic password reset email
✅ Flexible role assignment (member, volunteer, instructor, admin)
✅ Optional phone and name fields
✅ Error handling and user feedback
✅ Loading states and user notifications

## Usage

1. Navigate to `/members` (Members menu item)
2. Click "Register Member" button
3. Fill in member details:
   - **Email** (required) - Member's email address
   - **First Name** (optional) - Member's first name
   - **Last Name** (optional) - Member's last name
   - **Phone** (optional) - Member's phone number
   - **Roles** (optional) - Select member roles
4. Click "Register" to create the member
5. Member receives email with password setup link

## Role Options

- **member** - Basic member role
- **volunteer** - Volunteer role
- **instructor** - Can teach events
- **admin** - Full admin access

## Error Handling

The feature includes comprehensive error handling:
- Invalid email format
- Email already registered
- Server-side validation errors
- User-friendly error messages

## Security Notes

- Only users with "admin" role can access the registration page (AuthGate)
- Email confirmation is automatic (done by Edge Function)
- Members must set their own password via email link
- Service role credentials are only used on the backend (Edge Function)
- No sensitive data is exposed to the client

## Testing

The feature is covered by existing test patterns. To test locally:

1. Start Supabase locally: `supabase start`
2. Deploy the Edge Function: `supabase functions deploy register-member`
3. Register a test member through the UI
4. Verify member appears in the list
5. Check that member receives invitation email (in Supabase dashboard)

## Future Enhancements

- Batch registration via CSV import
- Email templates customization
- Member status (active, inactive, suspended)
- Bulk actions (edit, delete, change roles)
- Member invitation history
- Email resend functionality
