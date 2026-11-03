-- Go-live step 2 · Creates the first real record: the system owner, who then adds everyone else from the System page.
-- Replace the name and the email on the first two lines, run it once in the Supabase SQL editor, then invite that email under
-- Authentication > Users > Invite user. On first sign-in the account links to this record by email.
do $$
declare v_name text := 'FULL NAME'; v_email text := 'work.email@coded.kw';
begin
  if v_name = 'FULL NAME' or v_email = 'work.email@coded.kw' then
    raise exception 'Replace FULL NAME and work.email@coded.kw at the top of this script first. Nothing was changed.';
  end if;
  insert into people (full_name, email, roles, is_full_timer) values (trim(v_name), lower(trim(v_email)), array['system_owner'], true)
  on conflict (email) do update set roles = array(select distinct unnest(people.roles || array['system_owner']));
end $$;
select id, full_name, email, roles from people where roles @> array['system_owner'];
