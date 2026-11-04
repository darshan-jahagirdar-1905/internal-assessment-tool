-- RLS and privilege checks (architecture.md section 6.2). Fails (raises) on
-- the first problem. Runs in CI after the migrations; safe to run anywhere,
-- it only reads the catalog.
do $$
declare
  r record;
  problems text := '';
begin
  -- 1. RLS enabled on every table in public
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    problems := problems || format(E'\n  RLS is off on table %s', r.relname);
  end loop;

  -- 2. No policies at all (the API connects as the owner; nobody else gets in)
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    problems := problems || format(E'\n  Policy %s exists on %s', r.policyname, r.tablename);
  end loop;

  -- 3. anon and authenticated have no table privileges
  for r in
    select c.relname, role.rolname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as role(rolname)
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
      and (has_table_privilege(role.rolname, c.oid, 'SELECT')
        or has_table_privilege(role.rolname, c.oid, 'INSERT')
        or has_table_privilege(role.rolname, c.oid, 'UPDATE')
        or has_table_privilege(role.rolname, c.oid, 'DELETE'))
  loop
    problems := problems || format(E'\n  %s can access %s', r.rolname, r.relname);
  end loop;

  -- 4. anon and authenticated can't execute any function in public
  for r in
    select p.oid::regprocedure::text as fn, role.rolname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) as role(rolname)
    where n.nspname = 'public' and has_function_privilege(role.rolname, p.oid, 'EXECUTE')
  loop
    problems := problems || format(E'\n  %s can execute %s', r.rolname, r.fn);
  end loop;

  if problems <> '' then
    raise exception 'RLS check failed:%', problems;
  end if;
  raise notice 'RLS check passed';
end $$;
