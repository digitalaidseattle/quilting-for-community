# Quilting for Community — Admin Portal

The admin portal and backend for [Quilting for Community](https://www.quiltingforcommunity.org/) (Q4C), a non-profit making quilting and fiber arts accessible. Built by Digital Aid Seattle.

This project replaces the Acuity Scheduling / Squarespace to schedule and manage classes. It owns the admin UI and the Supabase backend. A companion static site (the `Q4C-website` Next.js repo) will replace the current public frontend where participants and volunteers sign up.

This repo was based on the [DAS Admin Template](https://github.com/digitalaidseattle/das-admin-template).

## Tech stack

* React + TypeScript + Vite
* Material UI, with `@digitalaidseattle/core`, `@digitalaidseattle/mui`, and `@digitalaidseattle/supabase` shared packages providing the app shell, auth, and Supabase plumbing
* Supabase (Postgres, auth, RLS) with versioned migrations
* Vercel (app hosting) and GitHub Actions (migration deployment)

## Features

* CRUD events and sessions for them. Easily clone events too.
* List and calendar views for events
* View list of all users and details about them
* Integration tests against local Supabase in `test/integration/` (`npm run test:integration`)

## Dev Environment Setup

- create `.env` file and add vars that another dev will provide
- install [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started?queryGroups=platform&platform=macos) and Docker (required for Supabase to run locally)
- run `supabase start`
- run `npm install`
- run `npm run dev`

When you're done developing:
- stop the `npm run dev` process in the terminal
- run `supabase stop`

## Environments

Changes are promoted along the branch flow `feature -> dev -> qa -> main`.  Each tier has its own Supabase project so that schema changes are exercised before they reach production data.

| | Branch | Site | Database |
| --- | --- | --- | --- |
| Local | feature branches | `npm run dev` on port 3000 | local Supabase (Docker) |
| QA | `dev`, `qa` | Vercel preview deployments. The `qa` branch has a stable URL | QA Supabase project |
| Production | `main` | Vercel production deployment | production Supabase project |

Pull request previews on Vercel point at the QA database, so a PR that adds a migration will not see its own schema change until it is merged to `dev`.  Test schema changes locally with `supabase start` first.

## Deployment

The application is deployed on Vercel.  Pushes to `main` publish the production deployment. Every other branch gets a preview deployment.  Supabase environment variables are configured in the Vercel project: the Production scope points at the production Supabase project and the Preview scope points at QA.

Database migrations are deployed by `.github/workflows/supabase-migrations.yml`:
- **pull request** - applies every migration to a throwaway database in the runner and lints the schema.  Nothing hosted is touched.
- **push to `dev` or `qa`** - `supabase db push` against the QA project.
- **push to `main`** - `supabase db push` against the production project.

Migrations are forward-only. To undo one, add a new migration.  The workflow reads its credentials from the `qa` and `production` GitHub environments.

### Local test logins

`supabase db reset` reloads `supabase/test_data/users.sql`, which creates two throwaway accounts on the local stack so you can sign in with email/password instead of going through Google:

| Email | Password | Roles |
| --- | --- | --- |
| `admin@example.com` | `password123` | `admin` |
| `member@example.com` | `password123` | `participant` |

## FAQ

### How do I connect to Supabase?

Environment variables for connecting to Supabase must be added to the hosting platform as well as the `.env.local` file.  Squad members must obtain the supabase url and auth_anon_key for accessing the Supabase project.  Use the local values printed by `supabase start` for day-to-day development, and the QA project's url and anon key when you need to work against shared data.  Do not point a local build at production.

### How do I change the navbar, toolbar, logo, or app name?

The drawer menu items, toolbar items, and logo are all configured in `src/TemplateConfig.tsx`.  Logo image files live in `src/assets/images/`.  The application name comes from the `VITE_APPLICATION_NAME` env var.

### How do I add a page to the application?

New pages go in `src/pages/` by convention, and `src/pages/routes.tsx` must be updated for the page to be routable.  Wrap admin-only routes in `AuthGate` with the appropriate roles.

### Integration tests with Supabase CLI

```bash
npx supabase start
npx supabase db reset  # run migrations
npm run test:integration  # or just test
```

Required environment variables:
* `SUPABASE_SECRET_KEY`

Run `npx supabase status` to view authentication keys. `.env.test.local` file can be used.

In order to preserve the local database in case of local manual testing, integration tests should clean up any test data. If this isn't a concern, feel free to run `npx supabase db reset` to reset the database before running the tests.
