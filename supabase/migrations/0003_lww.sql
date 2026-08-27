-- Last-write-wins on the server: an update carrying an older updated_at than
-- the stored row is ignored. Devices that come online with stale copies can
-- no longer regress newer data. Run after 0002_activity.sql.
create or replace function lww_guard() returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- skip the update, keep the newer row
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['jobs','runs','poles','spans','passes','robots','edits'] loop
    execute format('drop trigger if exists lww on %I', t);
    execute format('create trigger lww before update on %I for each row execute function lww_guard()', t);
  end loop;
end $$;
