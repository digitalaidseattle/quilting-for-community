-- QUIL-64: Create a products table and products history table


-- Helper function
create or replace function public.constant_exists(
    p_type text,
    p_value text
)
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.constants
        where type = p_type
          and value = p_value
    );
$$;

-- Table Definition
create table public.products (
id uuid primary key default gen_random_uuid(),
category text not null,
name text not null,
description text not null,
sku text unique not null,
options jsonb not null DEFAULT '{}'::jsonb,
images text[] not null DEFAULT '{}'::text[],
status text not null,
created_at timestamptz not null default now(),
created_by text,
updated_at timestamptz not null default now(),
updated_by text
);

-- Indices
create index products_category_idx on public.products(category);
create index products_status_idx on public.products(status);
create index products_sku_idx on public.products(sku);
create index products_name_idx on public.products(name);

-- Constraints and Triggers
create or replace function public.validate_product_constants()
returns trigger
language plpgsql
as $$
begin
    -- Validate status
    if new.status is not null then
        if not public.constant_exists('product-status', new.status) then
            raise exception
                'Invalid product status: "%".', new.status
                using errcode = '23514';
        end if;
    end if;

    -- Validate category
    if new.category is not null then
        if not public.constant_exists('product-category', new.category) then
            raise exception
                'Invalid product category: "%".', new.category
                using errcode = '23514';
        end if;
    end if;

    return new;
end;
$$;

create or replace trigger validate_product_constants_trigger
before insert or update
on public.products
for each row
execute function public.validate_product_constants();


create or replace trigger products_set_audit_fields
before insert or update on public.products
for each row execute function public.set_audit_fields();


-- RLS Policies
alter table public.products enable row level security;

create policy "products_public_read"
on public.products
for select
using (true);

create policy "products_admin_insert"
on public.products
for insert
with check (public.is_admin());

create policy "products_admin_update"
on public.products
for update
using (public.is_admin())
with check (public.is_admin());

create policy "products_admin_delete"
on public.products
for delete
using (public.is_admin());