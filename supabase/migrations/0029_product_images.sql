-- Product photos. The dashboard uploads a resized JPEG to the public bucket `product-images` under
-- "<store_id>/<uuid>.jpg" and stores its public URL in products.image_url (see save_product below).
-- Additive: one nullable column, one bucket, storage policies, and save_product with the same signature.

-- 1. Column --------------------------------------------------------------------------------------
alter table public.products add column if not exists image_url text;

-- 2. Bucket --------------------------------------------------------------------------------------
-- Public read (the URL is served without a session). Writes go through the policies in section 3.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Storage policies ----------------------------------------------------------------------------
-- Membership of the store named by the first path segment. Compared as text: a folder that is not a
-- uuid simply matches no store (no cast, so no error). Same shape as private.is_store_member (0009).
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_store_member_folder(p_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_members
    where store_id::text = p_folder and user_id = (select auth.uid())
  );
$$;
revoke execute on function private.is_store_member_folder(text) from public, anon;
grant execute on function private.is_store_member_folder(text) to authenticated;

-- Policies are created only when missing (no DROP, so re-running the migration is safe).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'product_images_member_select') then
    create policy product_images_member_select on storage.objects for select to authenticated
      using (bucket_id = 'product-images' and private.is_store_member_folder(split_part(name, '/', 1)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'product_images_member_insert') then
    create policy product_images_member_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'product-images' and private.is_store_member_folder(split_part(name, '/', 1)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'product_images_member_update') then
    create policy product_images_member_update on storage.objects for update to authenticated
      using (bucket_id = 'product-images' and private.is_store_member_folder(split_part(name, '/', 1)))
      with check (bucket_id = 'product-images' and private.is_store_member_folder(split_part(name, '/', 1)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'product_images_member_delete') then
    create policy product_images_member_delete on storage.objects for delete to authenticated
      using (bucket_id = 'product-images' and private.is_store_member_folder(split_part(name, '/', 1)));
  end if;
end $$;

-- 4. save_product (same signature and behaviour as 0024, plus image_url) -------------------------
-- image_url: accepted only when it is a public URL of this store's folder in the product-images bucket.
-- Anything else (absent, empty, another store's or another bucket's URL) is stored as null.
-- An update writes image_url every time, so a caller that omits it clears the photo: send it back.
create or replace function save_product(
  p_store_id uuid,
  p_product_id uuid,
  p_product jsonb,
  p_variants jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := p_product_id;
  v jsonb;
  v_image text := nullif(btrim(p_product->>'image_url'), '');
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not private.is_store_member(p_store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;
  if jsonb_typeof(p_product) is distinct from 'object' then
    raise exception 'p_product must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_variants) is distinct from 'array' then
    raise exception 'p_variants must be an array' using errcode = '22023';
  end if;

  if v_image is not null and not (
    length(v_image) <= 500
    and v_image like '%/storage/v1/object/public/product-images/' || p_store_id::text || '/%'
  ) then
    v_image := null;
  end if;

  if v_id is null then
    insert into products (store_id, name, description, aliases, price_cents, active, image_url)
    values (p_store_id, p_product->>'name', p_product->>'description', p_product->>'aliases',
            (p_product->>'price_cents')::integer, coalesce((p_product->>'active')::boolean, true), v_image)
    returning id into v_id;
  else
    update products
       set name = p_product->>'name',
           description = p_product->>'description',
           aliases = p_product->>'aliases',
           price_cents = (p_product->>'price_cents')::integer,
           active = coalesce((p_product->>'active')::boolean, active),
           image_url = v_image,
           updated_at = now()
     where id = v_id and store_id = p_store_id;
    if not found then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;

  -- Every variant id given must already belong to this product. Checked before any variant write.
  if exists (
    select 1 from jsonb_array_elements(p_variants) e
    where nullif(e->>'id', '') is not null
      and not exists (
        select 1 from product_variants pv
        where pv.id = (e->>'id')::uuid and pv.product_id = v_id and pv.store_id = p_store_id)
  ) then
    raise exception 'variant does not belong to this product' using errcode = 'P0002';
  end if;

  delete from product_variants pv
   where pv.product_id = v_id and pv.store_id = p_store_id
     and not exists (
       select 1 from jsonb_array_elements(p_variants) e
       where nullif(e->>'id', '') is not null and (e->>'id')::uuid = pv.id);

  for v in select value from jsonb_array_elements(p_variants) loop
    if nullif(v->>'id', '') is null then
      insert into product_variants (store_id, product_id, label, stock_quantity, price_cents)
      values (p_store_id, v_id, coalesce(nullif(btrim(v->>'label'), ''), 'Default'),
              coalesce((v->>'stock_quantity')::integer, 0), (v->>'price_cents')::integer);
    else
      update product_variants
         set label = coalesce(nullif(btrim(v->>'label'), ''), 'Default'),
             stock_quantity = coalesce((v->>'stock_quantity')::integer, 0),
             price_cents = (v->>'price_cents')::integer,
             updated_at = now()
       where id = (v->>'id')::uuid and product_id = v_id and store_id = p_store_id;
    end if;
  end loop;

  return v_id;
end $$;

revoke execute on function save_product(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function save_product(uuid, uuid, jsonb, jsonb) to authenticated;
