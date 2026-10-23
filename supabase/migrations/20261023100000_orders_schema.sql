-- Orders and payments tables.
--
-- Shape: a person pays for an ORDER. An order has ORDER ITEMS, and an item
-- points at the class that was bought. A PAYMENT belongs to an order.
-- Registrations made as part of an order point at it.
--
--   profile -< orders -< order_items >- events
--                 |-< payments
--                 |-< event_registrations

begin;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- restrict: keep money records even if an admin tries to delete the person
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded')),
  amount int not null check (amount >= 0),
  payment_date timestamptz,
  -- Chosen by the client and sent with the request that creates the order, so a
  -- double click or a retried request returns the first order instead of
  -- making a second one.
  request_id uuid unique,
  created_at timestamptz default now(),
  created_by text,
  updated_at timestamptz default now(),
  updated_by text
);

create index orders_profile_id_idx on public.orders(profile_id);
create index orders_status_idx on public.orders(status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete restrict,
  amount int not null check (amount >= 0),
  created_at timestamptz default now(),
  created_by text,
  updated_at timestamptz default now(),
  updated_by text
);

create index order_items_order_id_idx on public.order_items(order_id);
create index order_items_event_id_idx on public.order_items(event_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  type text not null default 'stripe'
    check (type in ('cash', 'stripe', 'paypal', 'clover')),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
  amount int not null check (amount > 0),
  currency text not null default 'usd',
  -- The provider's ids, whichever provider `type` names:
  -- the provider's customer id (Stripe cus_...), reused on the person's next checkout
  provider_customer_id text,
  -- the money movement, recorded on success (Stripe payment intent, PayPal capture, Clover payment)
  provider_payment_id text,
  -- the hosted checkout the person is sent to (Stripe Checkout session, PayPal order)
  provider_checkout_id text unique,
  -- staff's note for a payment taken in person
  reference text,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  created_by text,
  updated_at timestamptz default now(),
  updated_by text
);

create index payments_order_id_idx on public.payments(order_id);
create index payments_provider_payment_id_idx on public.payments(provider_payment_id);
create index payments_pending_expiry_idx on public.payments(expires_at) where status = 'pending';
-- An order has at most one payment in flight.
create unique index payments_one_pending_per_order_idx
  on public.payments(order_id)
  where status = 'pending';

create trigger orders_set_audit_fields
  before insert or update on public.orders
  for each row execute function public.set_audit_fields();
create trigger order_items_set_audit_fields
  before insert or update on public.order_items
  for each row execute function public.set_audit_fields();
create trigger payments_set_audit_fields
  before insert or update on public.payments
  for each row execute function public.set_audit_fields();

-- A registration made as part of an order. Null when nothing was charged.
alter table public.event_registrations
  add column order_id uuid references public.orders(id);

create index event_registrations_order_id_idx on public.event_registrations(order_id);

alter table public.event_registrations
  drop constraint event_registrations_status_check;
alter table public.event_registrations
  add constraint event_registrations_status_check
  check (status in ('pending', 'confirmed', 'cancelled'));

-- A pending (unpaid) registration also blocks a duplicate for the same person.
drop index public.event_registrations_confirmed_once_idx;
create unique index event_registrations_active_once_idx
  on public.event_registrations(session_id, profile_id)
  where status in ('pending', 'confirmed');

-- RLS: admins read everything. People read their own orders and payments. No
-- client writes, admins included. Only security definer functions and the service role write.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

-- Supabase grants anon and authenticated full access to every new table in public by default. 
-- Explicitly grant only the permissions we want.
revoke all on public.orders, public.order_items, public.payments from public, anon, authenticated;
grant select on public.orders, public.order_items, public.payments to authenticated;
grant select, insert, update, delete on public.orders, public.order_items, public.payments to service_role;

create policy orders_select on public.orders
  for select to authenticated
  using (
    public.is_admin()
    or profile_id in (select id from public.profiles where auth_id = auth.uid())
  );
-- Everything under an order is visible to whoever can see the order. The subqueries are themselves filtered by the policy on the table they read.
create policy order_items_select on public.order_items
  for select to authenticated
  using (order_id in (select id from public.orders));
create policy payments_select on public.payments
  for select to authenticated
  using (order_id in (select id from public.orders));

commit;
