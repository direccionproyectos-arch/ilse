-- ===========================================================
--  Folios de facturación · tablas para Supabase
--  Pega todo esto en Supabase → SQL Editor → New query → Run
-- ===========================================================

create table if not exists public.folio_emisoras (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  rfc             text,
  nombre_archivo  text,
  alias           text,
  updated_at      timestamptz default now()
);
-- (si ya habías creado la tabla antes, esto agrega la columna nueva)
alter table public.folio_emisoras add column if not exists rfc text;

create table if not exists public.folio_receptoras (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  rfc             text,
  direccion       text,
  cp              text,
  colonia         text,
  ciudad          text,
  nombre_archivo  text,
  alias           text,
  sucursal        text,
  promotor        text,
  no_cuenta       text,
  forma_pago      text,
  metodo_pago     text,
  uso_cfdi        text,
  updated_at      timestamptz default now()
);

create table if not exists public.folio_conceptos_sat (
  id                    uuid primary key default gen_random_uuid(),
  concepto_normalizado  text not null unique,
  concepto_ejemplo      text,
  clave_prod_serv       text not null,
  descripcion_prod_serv text,
  clave_unidad          text,
  descripcion_unidad    text,
  usos                  integer default 0,
  updated_at            timestamptz default now()
);

-- Seguridad: sólo usuarios con sesión iniciada pueden leer y escribir.
alter table public.folio_emisoras      enable row level security;
alter table public.folio_receptoras    enable row level security;
alter table public.folio_conceptos_sat enable row level security;

do $$
declare t text;
begin
  foreach t in array array['folio_emisoras','folio_receptoras','folio_conceptos_sat'] loop
    execute format('drop policy if exists "autenticados_todo" on public.%I', t);
    execute format('create policy "autenticados_todo" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
