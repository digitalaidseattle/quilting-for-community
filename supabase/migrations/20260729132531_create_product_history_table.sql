-- QUIL-64: Create a products table and products history table

-- Table Definition
create table public.product_history (
id uuid primary key default gen_random_uuid(),
product_id uuid NOT NULL REFERENCES public.products ON DELETE CASCADE,
change_date timestamptz not null default now(),
sale_price decimal(10,2),
regular_price decimal(10,2) NOT NULL,
created_at timestamptz not null default now(),
created_by text,
updated_at timestamptz not null default now(),
updated_by text
);

-- Indices
create index products_history_product_id_idx on public.product_history(product_id);
create index products_history_change_date_idx on public.product_history(change_date);
create index products_history_sale_price_idx on public.product_history(sale_price);
create index products_history_regular_price_idx on public.product_history(regular_price);

-- index to help get most recent price history of specific products
create index product_history_product_date_idx on public.product_history(product_id, change_date desc);

-- Constraints and Triggers
ALTER TABLE public.product_history
ADD CONSTRAINT product_history_regular_price_non_negative
CHECK (regular_price >= 0);

ALTER TABLE public.product_history
ADD CONSTRAINT product_history_sale_price_valid
CHECK (
    sale_price IS NULL
    OR (sale_price >= 0 AND sale_price <= regular_price)
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
