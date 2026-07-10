# Product Requirements Document: Quilting For Community

**Version:** 0.1 (draft)  
**Last updated:** June 2026  
**Status:** Admin foundation in progress; public signup and payments not yet shipped

---

## 1. Overview

### 1.1 Product summary

Quilting For Community is a web application for a quilting nonprofit to **schedule classes and events**, let community members **sign up** (as participants or volunteers), manage **waitlists**, collect **sliding-scale payments and donations**, and give staff **roster and communication tools**—without building an in-app email system.

The app is a single React + Supabase product with **public browsing/signup** and **role-gated admin/volunteer areas**, forked from the Digital Aid Seattle admin template.

### 1.2 Problem statement

The organization runs quilting classes and community events with limited staff. They need:

- A central place to define reusable class templates and schedule sessions
- Self-service signup for participants (including guests without accounts)
- Volunteer staffing with separate capacity limits
- Transparent waitlists when classes fill up
- Affordable, sliding-scale pricing and optional donations
- Liability waivers tied to signup
- Simple roster access for volunteers and admins (copy emails, not mass messaging)

### 1.3 Goals

| Goal | Success metric |
|------|----------------|
| Reduce admin overhead for scheduling | Admin can create a published session from a template in under 2 minutes |
| Increase class accessibility | Guests can sign up without creating an account |
| Fair access when classes fill | Waitlist position is visible; promotion is automatic on cancel |
| Sustainable funding | Sliding-scale Stripe checkout + standalone donations |
| Safe operations | Signed waiver version stored per signup; roles enforced via RLS |

### 1.4 Non-goals (v1)

- In-app mass email or SMS campaigns
- DocuSign or third-party e-signature integrations
- Native mobile apps
- Automated class reminder drip campaigns
- Separate public member site vs. admin app (single app with role-based routes)

---

## 2. Users & roles

| Role | Description | Key capabilities |
|------|-------------|------------------|
| **Guest** | No account | Browse published sessions, sign up as participant, sign waiver, pay (when enabled), manage signup via emailed link |
| **User** | Registered participant | Everything guest has + `/my-classes` dashboard tied to profile |
| **Volunteer** | Registered helper | Everything user has + view session rosters, copy signup emails |
| **Admin** | Staff | Full template/session/waiver CRUD, publish/cancel sessions, member role management |

**Volunteer signups require an account.** Guest signups are **participant-only**.

---

## 3. Current implementation status

Legend: ✅ Built · 🟡 Partial · ❌ Not built · 🗑️ Removed / deferred from current branch

### 3.1 Platform & shell

| Feature | Status | Notes |
|---------|--------|-------|
| React + TypeScript + Vite + MUI app shell | ✅ | DAS template: toolbar, drawer nav, loading/refresh contexts |
| Supabase auth (OAuth via DAS `Login`) | ✅ | Google/Microsoft when configured in Supabase |
| Email/password registration UI | ❌ | DAS SSO login only; custom `LoginPage` discussed but not on current branch |
| Firebase static hosting CI | ✅ | `.github/workflows/firebase-hosting-pull-request.yml` |
| Role-based route protection (`AuthGate`) | 🟡 | Enabled on admin routes; public class routes not wired |
| Role-based navigation | 🟡 | Admin nav exists; public Classes/Events nav items point to routes not yet implemented |
| Dashboard home page | 🟡 | `SamplePage` placeholder |
| Privacy policy (Markdown) | ✅ | `/privacy` via `MarkdownPage` |
| Legacy template pages (Products, Transactions) | ✅ | Still in nav; unrelated to quilting product |

### 3.2 Database & backend

| Feature | Status | Notes |
|---------|--------|-------|
| Versioned migration (`20240611000000_initial_schema.sql`) | ✅ | Single combined migration |
| `profiles` table with `roles[]` | ✅ | Linked to `auth.users` |
| Auto profile creation on signup (`handle_new_user`) | 🗑️ | Intentionally removed; admins create/link profiles manually for now |
| JWT role sync trigger | 🗑️ | `sync_user_roles_to_auth` not in current migration |
| `form_templates` (waivers) | ✅ | Markdown body + version |
| `event_templates` | ✅ | Reusable class/event blueprints |
| `event_sessions` | ✅ | Scheduled instances with draft/published/cancelled status |
| `event_signups` + waitlist logic | 🗑️ | Built in earlier iteration, removed for admin-only milestone |
| Signup RPCs (`signup_for_event`, `cancel_signup`, etc.) | 🗑️ | Removed with signups table |
| `payments` table | ❌ | Planned for Stripe phase |
| `class_session_groups` / combined capacity | ❌ | Phase 3 |
| Recurrence / session series | ❌ | Phase 3 |
| RLS: admin-only on templates, sessions, forms | ✅ | No public read policies on current branch |
| Sample seed data | ✅ | One waiver, template, and published session |

> **Naming note:** The schema uses `event_*` table names (`event_templates`, `event_sessions`). Product language may refer to these as **classes** or **events** interchangeably. Nav currently exposes both labels; implementation should converge on one term.

### 3.3 Admin features

| Feature | Status | Notes |
|---------|--------|-------|
| **Event Management** page (`/admin/event-management`) | ✅ | Single page with **Templates** and **Sessions** tabs |
| Template CRUD | ✅ | Title, description, type, duration, seats, volunteer seats, sliding-scale price fields, waiver link |
| Session CRUD | ✅ | Create from template or blank; datetime, overrides, status |
| Clone session | ✅ | Copies session as draft with "(copy)" title |
| Waiver / form template CRUD (`/admin/forms`) | ✅ | Title, markdown body, version |
| Session roster + copy emails | 🗑️ | Was built; removed with signup table |
| Member role management (`/members`) | ✅ | Assign `user`, `volunteer`, `admin` on existing profiles |

### 3.4 Public & participant features

| Feature | Status | Notes |
|---------|--------|-------|
| Public class/event list (searchable) | ❌ | Filter by name, date, duration, type |
| Calendar view toggle | ❌ | `react-big-calendar` was used in prototype; deps removed |
| Session detail page | ❌ | Seat counts, signup CTAs, waitlist state |
| Participant signup (guest) | ❌ | Name, email, phone; `manage_token` self-service link |
| Participant signup (logged-in) | ❌ | Links to `profile_id` |
| Volunteer signup | ❌ | Auth required |
| `/signup/manage/:token` guest manage page | ❌ | View status, waitlist position, cancel |
| `/my-classes` (or `/my-events`) dashboard | ❌ | Logged-in signup history |
| Waiver display + acceptance on signup | ❌ | Admin can create waivers; acceptance flow not wired |
| Guest-to-profile account linking | ❌ | Trigger to merge signups when email matches |

### 3.5 Volunteer features

| Feature | Status | Notes |
|---------|--------|-------|
| Session roster view | 🗑️ | Was `/admin/sessions/:id/roster` |
| Copy comma-separated emails | 🗑️ | Client-side clipboard from roster |
| Copy `mailto:` link | 🗑️ | With large-class fallback messaging |
| Filter roster by participants / volunteers / waitlist | 🗑️ | |

### 3.6 Payments & notifications

| Feature | Status | Notes |
|---------|--------|-------|
| Stripe sliding-scale class checkout | ❌ | Amount picker (min / suggested / max) |
| Free class bypass (amount = 0) | ❌ | |
| Standalone `/donate` page | ❌ | |
| `payments` table + webhook handler | ❌ | |
| Signup confirmation email | ❌ | Transactional only; edge function not deployed |
| Waitlist promotion email | ❌ | On cancel → promote next → notify |
| In-app mass messaging | 🗑️ | Explicitly rejected; copy-to-clipboard instead |

---

## 4. Product requirements (full vision)

### 4.1 Class & event templates (admin)

**User story:** As an admin, I create reusable templates so I don't re-enter the same details for every session.

**Requirements:**

- CRUD for templates with: title, description, class/event type, default duration, participant seat count, volunteer seat count, sliding-scale price min/suggested/max, linked waiver form
- Templates are admin-only (no public listing required)
- Templates serve as the source when creating new sessions

**Status:** ✅ Built (Templates tab on Event Management)

---

### 4.2 Scheduled sessions (admin)

**User story:** As an admin, I schedule specific class instances, publish them when ready, and clone past sessions for variations.

**Requirements:**

- CRUD for sessions with all template fields overridable per instance
- `start_at` / `end_at` scheduling
- Status: `draft`, `published`, `cancelled`
- Create from template (pre-fills fields) or blank
- Clone existing session as new draft
- Only `published` sessions visible on public browse (when built)

**Status:** ✅ Built (Sessions tab on Event Management)

---

### 4.3 Waiver forms (admin)

**User story:** As an admin, I maintain liability waivers that participants must accept before signup.

**Requirements:**

- CRUD for waiver forms: title, markdown body, version number
- Templates and sessions reference a waiver via `form_template_id`
- On signup: render waiver, require checkbox acceptance, store `waiver_signed_at` and `form_template_version` on signup row
- Optional future: store signed PDF in Supabase Storage

**Status:** 🟡 Admin CRUD built; signup acceptance flow ❌

---

### 4.4 Public browse & search

**User story:** As a community member, I find classes that fit my schedule and skill level.

**Requirements:**

- Public route (e.g. `/classes` or `/events`) listing **published** sessions only
- **List view** with server-side pagination/sort
- **Filters:** class name (search), date range, duration, type
- **Calendar view** toggle (month/week/agenda) sharing the same filter state
- Row/card click navigates to session detail

**Status:** ❌ Not built (nav links exist; pages removed)

---

### 4.5 Session detail

**User story:** As a visitor, I see everything I need to decide whether to sign up.

**Requirements:**

- Show title, description, type, date/time, duration, sliding-scale price range
- Show participant seats filled / capacity and volunteer slots filled / capacity
- Indicate when waitlist is available (class full)
- CTAs: Sign up (participant), Volunteer (login if not authenticated)
- If logged in and already signed up: show status and link to My Classes

**Status:** ❌ Not built

---

### 4.6 Signup & waitlist

**User story:** As a participant, I reserve a spot or join a transparent waitlist. As a volunteer, I sign up with my account.

**Requirements:**

**Participant (guest):**

- No account required
- Capture: first name (required), last name, email (required), phone (optional)
- Accept linked waiver
- On success: show confirmation + unique manage link (`/signup/manage/:token`)
- Optional: send confirmation email with manage link

**Participant (logged-in):**

- Pre-fill from profile where possible
- Signup appears on `/my-classes`

**Volunteer:**

- Must be authenticated
- Separate capacity pool (`volunteer_seat_count`)
- No guest volunteer signups

**Waitlist:**

- When capacity full, new signups get `status = waitlisted` with monotonic `waitlist_position`
- Position visible on manage page and My Classes
- On cancel of confirmed signup: auto-promote next waitlisted entry and renumber queue
- One signup per person per session (unique on `profile_id` or `guest_email`)

**Database:**

- `event_signups` table (or `class_signups` if renamed)
- Security-definer `signup_for_event()` — no direct client inserts
- `cancel_signup()` returns cancelled + promoted signup

**Status:** ❌ Not built (previously implemented, removed for admin-only milestone)

---

### 4.7 Guest self-service manage link

**User story:** As a guest who signed up without an account, I can check my status or cancel without logging in.

**Requirements:**

- Public route `/signup/manage/:token`
- Token is unguessable UUID (`manage_token`)
- Show session info, signup status, waitlist position
- Allow cancel (triggers waitlist promotion)
- No authentication required; token is the credential

**Status:** ❌ Not built

---

### 4.8 My Classes dashboard

**User story:** As a logged-in user, I see all my upcoming signups and waitlist positions in one place.

**Requirements:**

- Auth-required route `/my-classes` (or `/my-events`)
- List signups with session title, date, role (participant/volunteer), status, waitlist position
- Actions: view session, cancel signup

**Status:** ❌ Not built

---

### 4.9 Session roster (admin + volunteer)

**User story:** As a volunteer or admin, I see who signed up and can email them using my own email client.

**Requirements:**

- Route `/admin/sessions/:sessionId/roster` (admin + volunteer via `AuthGate`)
- DataGrid: name, email, signup type, status, waitlist #
- Resolve email from `profiles.email` or `guest_email`
- **Copy comma-separated** emails for current filter
- **Open in email client** via `mailto:` (warn if URL too long)
- Filters: all confirmed, participants, volunteers, waitlist
- **No in-app send** — clipboard and mailto only

**Status:** 🗑️ Was built; not on current branch

---

### 4.10 Member & role management (admin)

**User story:** As an admin, I assign volunteer and admin roles to community members.

**Requirements:**

- List profiles with email, name, roles
- Edit roles: `user`, `volunteer`, `admin` (multi-select)
- Roles enforced via RLS and `AuthGate`
- Profiles must exist in `profiles` table (manual creation or restored auto-signup trigger)

**Status:** ✅ Built (`/members`)

---

### 4.11 Authentication & registration

**User story:** As a new community member, I can sign in with Google/Microsoft or email and password.

**Requirements:**

- Supabase Auth with OAuth (configured in Supabase dashboard)
- Optional email/password registration page
- On first login: create `profiles` row with default `user` role
- Sync `profiles.roles` to JWT metadata for `AuthGate`
- Guest participant flow must remain available without registration

**Status:** 🟡 OAuth login via DAS; auto profile creation ❌; email registration page ❌

---

### 4.12 Payments (Stripe)

**User story:** As a participant, I pay what I can afford within the class's sliding scale. As a supporter, I donate without signing up for a class.

**Requirements:**

- Sliding scale UI: min, suggested, max labels; user picks amount
- `amount = 0` skips Stripe for free classes
- Edge function `create-checkout-session` with metadata (`session_id`, `signup_id`, amount)
- Webhook on `checkout.session.completed` → record payment, confirm signup if pending
- `payments` table: Stripe IDs, amount, type (`class` | `donation`)
- Standalone `/donate` page → Stripe Checkout → donation payment row

**Status:** ❌ Phase 3

---

### 4.13 Advanced scheduling (Phase 3)

**Repeating sessions**

- `recurrence_rule` on sessions (weekly, biweekly, monthly presets)
- Admin "Create series" generates N instances from a template
- Calendar shows all instances

**Combined session groups**

- `event_session_groups` (or `class_session_groups`) with `combined_seat_capacity`
- Signup capacity counted across grouped sessions
- Admin UI to link simultaneous sessions (e.g. two rooms sharing 12 total seats)

**Status:** ❌ Not built

---

### 4.14 Transactional notifications

**User story:** Signups and waitlist changes trigger helpful emails—not bulk class blasts.

**Requirements:**

- Signup confirmation (guest: includes manage link)
- Waitlist promotion when spot opens
- Implemented via Supabase Edge Function + email provider (e.g. Resend)
- **Not** mass messaging to entire roster from the app

**Status:** ❌ Not built (notification edge function was built then removed)

---

## 5. Information architecture

### 5.1 Routes (target state)

| Path | Access | Purpose | Status |
|------|--------|---------|--------|
| `/` | Auth shell | Dashboard | 🟡 Placeholder |
| `/classes` or `/events` | Public | Browse + calendar | ❌ |
| `/classes/:id` | Public | Session detail | ❌ |
| `/classes/:id/signup` | Public | Signup + waiver | ❌ |
| `/signup/manage/:token` | Token | Guest manage | ❌ |
| `/my-classes` | Auth | User signups | ❌ |
| `/donate` | Public | Donations | ❌ |
| `/admin/event-management` | Admin | Templates + Sessions tabs | ✅ |
| `/admin/forms` | Admin | Waiver CRUD | ✅ |
| `/admin/sessions/:id/roster` | Admin, Volunteer | Roster + copy emails | 🗑️ |
| `/members` | Admin | Role management | ✅ |
| `/login` | Public | Auth | ✅ |
| `/privacy` | Public | Privacy policy | ✅ |

### 5.2 Navigation (target state)

**Public / all users**

- Dashboard
- Classes (or Events — pick one label)

**Admin**

- Event Management (templates + sessions)
- Waivers
- Members

**Volunteer** (when roster returns)

- Roster access via session links or dedicated nav entry

---

## 6. Data model

### 6.1 Current tables

```
profiles
  id → auth.users
  first_name, last_name, email, phone
  roles text[]  -- user | volunteer | admin

form_templates
  title, body (markdown), version

event_templates
  title, description, event_type
  duration_minutes, seat_count, volunteer_seat_count
  price_min, price_suggested, price_max
  form_template_id → form_templates

event_sessions
  template_id → event_templates (nullable)
  title, description, event_type, start_at, end_at
  seat_count, volunteer_seat_count
  price_min, price_suggested, price_max
  form_template_id, status (draft|published|cancelled)
```

### 6.2 Planned tables (not in current migration)

```
event_signups
  session_id, profile_id (nullable)
  guest_email, guest_first_name, guest_last_name, guest_phone
  signup_type (participant|volunteer)
  status (confirmed|waitlisted|cancelled)
  waitlist_position, manage_token
  waiver_signed_at, form_template_version

payments
  stripe_checkout_session_id, stripe_payment_intent_id
  amount, type (class|donation)
  profile_id, signup_id (nullable)

event_session_groups (Phase 3)
  combined_seat_capacity

-- recurrence_rule column on event_sessions (Phase 3)
```

---

## 7. Technical architecture

| Layer | Choice |
|-------|--------|
| Frontend | React 18, TypeScript, Vite, MUI, MUI X Data Grid |
| Routing | react-router-dom v6 |
| Auth | Supabase Auth via `@digitalaidseattle/supabase` |
| API / data | Supabase Postgres + RLS + RPC functions |
| File storage | Supabase Storage (optional, waivers) |
| Payments | Stripe Checkout + Edge Function webhooks |
| Email | Edge Functions + transactional provider |
| Hosting | Firebase Hosting (static SPA) |

**Key patterns from DAS template**

- DAO + Service layer (`SupabaseDAO`, `EventsService`, `ProfilesService`)
- `LoadingContext` / `RefreshContext` for global UX
- `AuthGate` for role-based pages
- Server-side DataGrid pagination for admin lists

---

## 8. Phased delivery roadmap

### Phase 0 — Admin foundation ✅ (current milestone)

**Shipped:**

- Database migration for profiles, forms, templates, sessions
- Admin Event Management (templates + sessions tabs)
- Admin waiver CRUD
- Member role editing
- Admin-only RLS

**Explicitly excluded for this milestone:**

- Signups, waitlists, public pages
- Auto user/profile creation
- Payments, emails, roster

---

### Phase 1 — Core signup loop

**Goal:** End-to-end participant and volunteer signup without payments.

| Deliverable | Priority |
|-------------|----------|
| Restore `event_signups` table + RPCs + RLS | P0 |
| Public list + session detail pages | P0 |
| Guest + logged-in participant signup with waiver acceptance | P0 |
| Volunteer signup (auth required) | P0 |
| `/my-classes` and `/signup/manage/:token` | P0 |
| Session roster with copy-email tools | P0 |
| Restore `handle_new_user` + JWT role sync | P1 |
| Public RLS (read published sessions) | P0 |
| Role-based nav (hide admin from non-admins) | P1 |
| Converge naming: classes vs events | P1 |

**Exit criteria:** Admin publishes a session → guest signs up → appears on roster → guest cancels → waitlist promotes.

---

### Phase 2 — Calendar, polish, transactional email

| Deliverable | Priority |
|-------------|----------|
| Calendar view toggle on browse page | P1 |
| Guest-to-profile signup linking on registration | P2 |
| Signup confirmation email | P1 |
| Waitlist promotion email | P1 |
| Custom email/password login page (optional) | P2 |
| Replace dashboard placeholder with useful home | P2 |
| Remove legacy Products/Transactions nav if unused | P3 |

---

### Phase 3 — Payments & advanced scheduling

| Deliverable | Priority |
|-------------|----------|
| Stripe sliding-scale checkout on signup | P1 |
| `payments` table + webhook handler | P1 |
| Standalone `/donate` | P2 |
| Recurring session series | P2 |
| Combined session groups / shared capacity | P3 |

---

## 9. Open questions & decisions

| # | Question | Current leaning |
|---|----------|-----------------|
| 1 | Product term: **Classes** vs **Events**? | Schema uses `event_*`; nav shows both. Pick one for UX. |
| 2 | Public URL: `/classes` or `/events`? | Plan used `/classes`; recent work used `/events`. |
| 3 | Require payment before confirming signup? | Defer; allow signup first, pay optionally in Phase 3 |
| 4 | Waitlist promotion: auto-confirm or hold with expiry? | Auto-promote on cancel; optional 24h email to complete payment later |
| 5 | Should MainLayout require login for all routes? | Public browse must work without auth |
| 6 | Restore auto profile creation? | Yes before public launch; manual OK for admin testing |

---

## 10. Acceptance criteria (full product)

When the product is complete, an admin can:

1. Create a waiver, template, and published session
2. A guest can find the session, sign up, accept the waiver, and receive a manage link
3. A logged-in volunteer can sign up for the volunteer slot
4. When the class fills, the next signup receives a waitlist position
5. Cancelling a confirmed signup promotes the next waitlisted person
6. A volunteer can open the roster and copy emails for a mail merge
7. A participant can pay a sliding-scale amount via Stripe (or skip for free classes)
8. A supporter can donate without class signup
9. An admin can assign roles and manage all content without database access

---

## 11. Appendix: file map (implementation)

| Area | Location |
|------|----------|
| Migration | `supabase/migrations/20240611000000_initial_schema.sql` |
| Event services | `src/services/events/` |
| Admin UI | `src/pages/admin/AdminEventManagementPage.tsx`, `AdminFormsPage.tsx` |
| Members | `src/pages/MembersPage.tsx` |
| Routes | `src/pages/routes.tsx` |
| Nav | `src/TemplateConfig.tsx` |
| Auth wiring | `src/App.tsx` |

---

## 12. Document history

| Date | Change |
|------|--------|
| Jun 2026 | Initial PRD: reflects admin-only milestone + full planned scope from product discussions |
