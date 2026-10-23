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

Database migrations and edge functions are deployed by `.github/workflows/supabase-migrations.yml`:
- **pull request** - applies every migration to a throwaway database in the runner and lints the schema.  Nothing hosted is touched.
- **push to `dev` or `qa`** - `supabase db push` and `supabase functions deploy` against the QA project.
- **push to `main`** - `supabase db push` and `supabase functions deploy` against the production project.

Migrations are forward-only. To undo one, add a new migration.  The workflow reads its credentials from the `qa` and `production` GitHub environments.

### Local test logins

`supabase db reset` reloads `supabase/test_data/users.sql`, which creates two throwaway accounts on the local stack so you can sign in with email/password instead of going through Google:

| Email | Password | Roles |
| --- | --- | --- |
| `admin@example.com` | `password123` | `admin` |
| `member@example.com` | `password123` | `participant` |

### Stripe payments
Paid class registration uses Stripe Checkout through two edge functions in `supabase/functions/`: `create-checkout` (starts Checkout for a pending payment) and `stripe-webhook` (records the result). The static public site never sees the Stripe secret key.

Before the first deploy to a Supabase project, set its secrets once (use the test-mode key on QA, the live key on production):

```bash
supabase secrets set --project-ref <project-id> \
  STRIPE_SECRET_KEY=sk_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  ALLOWED_RETURN_URLS=https://<public-site-origin>/<base-path>/
```

`STRIPE_WEBHOOK_SECRET` comes from a webhook endpoint you add in the Stripe dashboard, pointing at `https://<project-id>.supabase.co/functions/v1/stripe-webhook` and sending these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. `ALLOWED_RETURN_URLS` is a comma-separated list of URL prefixes Stripe may send people back to.

#### Running payments locally
1. Copy `supabase/functions/.env.example` to `supabase/functions/.env` (gitignored) and fill in a Stripe **test** secret key.
2. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and get a local webhook signing secret for `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --api-key sk_test_... --print-secret
   ```
3. With `supabase start` running, serve the functions and forward Stripe's events to them (two terminals):
   ```bash
   mkdir -p supabase/.temp/tmp
   TMPDIR="$PWD/supabase/.temp/tmp" npx supabase functions serve --env-file supabase/functions/.env
   stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook \
     --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired
   ```
   The `TMPDIR` override works around Docker Desktop setups that don't share macOS's default temp folder with containers, which makes the edge runtime fail with "failed to determine entrypoint". A folder inside the repo is always shared, since the functions are mounted from it too. `supabase/.temp` is gitignored and excluded from ESLint.
4. Pay with Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

#### Testing the edge functions
```bash
npm run test:functions
```
These tests sit next to each function (`supabase/functions/*/index.test.ts`) and run in Node with Stripe and the database replaced by fakes, so they need no Stripe key, no Docker and no running Supabase. The webhook's signature check is exercised for real. The database side of payments is covered by the integration tests.

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
* `SUPABASE_SECRET_KEY`=<SERVICE_ROLE_KEY>
* `VITE_SUPABASE_ANON_KEY`=<ANON_KEY>

Run `npx supabase status -o env` to view the `SERVICE_ROLE_KEY` and `ANON_KEY` authentication keys. `.env.test.local` file can be used.

In order to preserve the local database in case of local manual testing, integration tests should clean up any test data. If this isn't a concern, feel free to run `npx supabase db reset` to reset the database before running the tests.
