create or replace function public.create_temp_mail_inbox(p_domain text)
returns public.temp_mail_inboxes language plpgsql security invoker set search_path to ''
as $function$
declare result public.temp_mail_inboxes;
begin
if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
if p_domain is null or p_domain not in ('hahjxbnb.com','quick.hahjxbnb.com','drop.hahjxbnb.com','xzckfn.eu.cc') then raise exception 'Unsupported receiving domain' using errcode='22023'; end if;
for attempt in 1..20 loop
begin
insert into public.temp_mail_inboxes(user_id,address) values(auth.uid(),left(replace(gen_random_uuid()::text,'-',''),5+floor(random()*6)::int)||'@'||p_domain) returning * into result;
return result;
exception when unique_violation then
end;
end loop;
raise exception 'Please retry generating an address';
end; $function$;

create or replace function public.create_temp_mail_inbox()
returns public.temp_mail_inboxes language sql security invoker set search_path to ''
as $function$ select public.create_temp_mail_inbox('hahjxbnb.com'::text); $function$;
alter table public.temp_mail_inboxes drop constraint temp_mail_inboxes_address_check;
alter table public.temp_mail_inboxes add constraint temp_mail_inboxes_address_check
check (address ~ '^([a-f0-9]{5,10}|[a-f0-9]{32})@((temp|mail|inbox|box|code|receive)\.kellykhoo\.com|xzckfn\.eu\.cc|(quick\.|drop\.)?hahjxbnb\.com)$');