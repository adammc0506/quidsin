-- QuidsIn schema. Run in the Supabase SQL editor (or `supabase db push`).
-- Tables are closed to the public; the app only calls the qi_* functions,
-- which require the group reference. The reference acts as the access key.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.qi_groups (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  currency text not null default 'GBP',
  created_at timestamptz not null default now()
);

create table if not exists public.qi_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.qi_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table if not exists public.qi_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.qi_groups(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 120),
  amount_pence bigint not null check (amount_pence > 0),
  paid_by uuid not null references public.qi_members(id),
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.qi_expense_shares (
  expense_id uuid not null references public.qi_expenses(id) on delete cascade,
  member_id uuid not null references public.qi_members(id),
  share_pence bigint not null check (share_pence >= 0),
  primary key (expense_id, member_id)
);

create table if not exists public.qi_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.qi_groups(id) on delete cascade,
  from_member uuid not null references public.qi_members(id),
  to_member uuid not null references public.qi_members(id),
  amount_pence bigint not null check (amount_pence > 0),
  created_at timestamptz not null default now()
);

create index if not exists qi_members_group on public.qi_members(group_id);
create index if not exists qi_expenses_group on public.qi_expenses(group_id);
create index if not exists qi_settlements_group on public.qi_settlements(group_id);

-- Lock the tables: RLS on, no policies = no direct access for anon/authenticated.
alter table public.qi_groups enable row level security;
alter table public.qi_members enable row level security;
alter table public.qi_expenses enable row level security;
alter table public.qi_expense_shares enable row level security;
alter table public.qi_settlements enable row level security;

-- ---------- helpers ----------
create or replace function public.qi_new_reference() returns text
language plpgsql as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := extensions.gen_random_bytes(8);
  s text := '';
begin
  for i in 0..7 loop
    s := s || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return 'QI-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
end $$;

create or replace function public.qi_group_id(p_ref text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from qi_groups where reference = upper(p_ref)
$$;

-- ---------- API ----------
create or replace function public.qi_create_group(p_name text, p_members text[]) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ref text;
  v_id uuid;
  m text;
begin
  if array_length(p_members, 1) is null or array_length(p_members, 1) < 2 or array_length(p_members, 1) > 50 then
    raise exception 'A group needs between 2 and 50 people';
  end if;
  loop
    v_ref := qi_new_reference();
    exit when not exists (select 1 from qi_groups where reference = v_ref);
  end loop;
  insert into qi_groups (reference, name) values (v_ref, trim(p_name)) returning id into v_id;
  foreach m in array p_members loop
    insert into qi_members (group_id, name) values (v_id, trim(m));
  end loop;
  return v_ref;
end $$;

create or replace function public.qi_get_group(p_ref text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reference', g.reference,
    'name', g.name,
    'currency', g.currency,
    'createdAt', g.created_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.created_at, m.name)
      from qi_members m where m.group_id = g.id), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'description', e.description, 'amountPence', e.amount_pence,
        'paidBy', e.paid_by, 'spentOn', e.spent_on, 'createdAt', e.created_at,
        'shares', coalesce((select jsonb_agg(jsonb_build_object('memberId', s.member_id, 'pence', s.share_pence))
                            from qi_expense_shares s where s.expense_id = e.id), '[]'::jsonb)
      ) order by e.spent_on desc, e.created_at desc)
      from qi_expenses e where e.group_id = g.id), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'from', s.from_member, 'to', s.to_member,
                                          'amountPence', s.amount_pence, 'createdAt', s.created_at)
                       order by s.created_at desc)
      from qi_settlements s where s.group_id = g.id), '[]'::jsonb)
  )
  from qi_groups g where g.reference = upper(p_ref)
$$;

create or replace function public.qi_add_member(p_ref text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gid uuid := qi_group_id(p_ref); v_id uuid;
begin
  if v_gid is null then raise exception 'Group not found'; end if;
  insert into qi_members (group_id, name) values (v_gid, trim(p_name)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.qi_add_expense(
  p_ref text, p_description text, p_amount_pence bigint, p_paid_by uuid, p_spent_on date, p_shares jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gid uuid := qi_group_id(p_ref);
  v_id uuid;
  v_sum bigint;
begin
  if v_gid is null then raise exception 'Group not found'; end if;
  if not exists (select 1 from qi_members where id = p_paid_by and group_id = v_gid) then
    raise exception 'Payer is not in this group';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_shares) x
    where not exists (select 1 from qi_members m where m.id = (x->>'memberId')::uuid and m.group_id = v_gid)
  ) then
    raise exception 'Share for someone not in this group';
  end if;
  select coalesce(sum((x->>'pence')::bigint), 0) into v_sum from jsonb_array_elements(p_shares) x;
  if v_sum <> p_amount_pence then raise exception 'Shares must add up to the total'; end if;

  insert into qi_expenses (group_id, description, amount_pence, paid_by, spent_on)
  values (v_gid, trim(p_description), p_amount_pence, p_paid_by, coalesce(p_spent_on, current_date))
  returning id into v_id;
  insert into qi_expense_shares (expense_id, member_id, share_pence)
  select v_id, (x->>'memberId')::uuid, (x->>'pence')::bigint from jsonb_array_elements(p_shares) x;
  return v_id;
end $$;

create or replace function public.qi_delete_expense(p_ref text, p_expense_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from qi_expenses where id = p_expense_id and group_id = qi_group_id(p_ref);
end $$;

create or replace function public.qi_add_settlement(p_ref text, p_from uuid, p_to uuid, p_amount_pence bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gid uuid := qi_group_id(p_ref); v_id uuid;
begin
  if v_gid is null then raise exception 'Group not found'; end if;
  if (select count(*) from qi_members where group_id = v_gid and id in (p_from, p_to)) <> 2 then
    raise exception 'Both people must be in this group';
  end if;
  insert into qi_settlements (group_id, from_member, to_member, amount_pence)
  values (v_gid, p_from, p_to, p_amount_pence) returning id into v_id;
  return v_id;
end $$;

-- Only the API functions are callable from the app.
revoke all on function public.qi_new_reference() from public, anon, authenticated;
revoke all on function public.qi_group_id(text) from public, anon, authenticated;
grant execute on function
  public.qi_create_group(text, text[]),
  public.qi_get_group(text),
  public.qi_add_member(text, text),
  public.qi_add_expense(text, text, bigint, uuid, date, jsonb),
  public.qi_delete_expense(text, uuid),
  public.qi_add_settlement(text, uuid, uuid, bigint)
to anon, authenticated;
