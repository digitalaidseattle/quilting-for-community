-- QUIL-64: Create a products table and products history table

-- Table Definition
create table public.product_history (
id uuid primary key default gen_random_uuid(),
product_id uuid not null references public.products on delete cascade,
change_date timestamptz not null default now(),
sale_price decimal(10,2),
regular_price decimal(10,2) not null,
created_at timestamptz not null default now(),
created_by text,
updated_at timestamptz not null default now(),
updated_by text
);

-- Indices
create index products_history_product_id_idx on public.product_history(product_id);

-- Constraints and Triggers
alter table public.product_history
add constraint product_history_regular_price_non_negative
check (regular_price >= 0);

alter table public.product_history
add constraint product_history_sale_price_valid
check (
    sale_price is null
    or (sale_price >= 0 and sale_price <= regular_price)
);

create or replace trigger products_set_audit_fields
before insert or update on public.product_history
for each row execute function public.set_audit_fields();

-- RLS Policies
alter table public.product_history enable row level security;

create policy "products_history_public_read"
on public.product_history
for select
using (true);

create policy "products_history_admin_insert"
on public.product_history
for insert
with check (public.is_admin());

create policy "products_history_admin_update"
on public.product_history
for update
using (public.is_admin())
with check (public.is_admin());

create policy "products_history_admin_delete"
on public.product_history
for delete
using (public.is_admin());
