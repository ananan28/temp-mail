DO $b$ DECLARE old_expr text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO old_expr FROM pg_constraint WHERE conrelid='public.temp_mail_inboxes'::regclass AND conname='temp_mail_inboxes_address_check';
 ALTER TABLE public.temp_mail_inboxes DROP CONSTRAINT temp_mail_inboxes_address_check;
 EXECUTE 'ALTER TABLE public.temp_mail_inboxes ADD CONSTRAINT temp_mail_inboxes_address_check CHECK (('||old_expr||') OR address ~ '||quote_literal('^[a-f0-9]{5,10}@(pine|dusk)\.xnmaskzmx\.cam$')||')';
END $b$;
CREATE OR REPLACE FUNCTION public.create_temp_mail_inbox(p_domain text) RETURNS public.temp_mail_inboxes LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
declare result public.temp_mail_inboxes;
begin
if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
if p_domain is null or p_domain not in ('pine.xnmaskzmx.cam','dusk.xnmaskzmx.cam') then raise exception 'Unsupported receiving domain' using errcode='22023'; end if;
for attempt in 1..20 loop
begin
insert into public.temp_mail_inboxes(user_id,address) values(auth.uid(),left(replace(gen_random_uuid()::text,'-',''),5+floor(random()*6)::int)||'@'||p_domain) returning * into result;
return result;
exception when unique_violation then
end;
end loop;
raise exception 'Please retry generating an address';
end; $f$;
CREATE OR REPLACE FUNCTION public.create_temp_mail_inbox() RETURNS public.temp_mail_inboxes LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ select public.create_temp_mail_inbox('pine.xnmaskzmx.cam'::text); $f$;