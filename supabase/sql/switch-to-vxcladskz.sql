DO $b$ DECLARE old_expr text; BEGIN
SELECT pg_get_expr(conbin,conrelid) INTO old_expr FROM pg_constraint WHERE conrelid='public.temp_mail_inboxes'::regclass AND conname='temp_mail_inboxes_address_check';
IF old_expr IS NULL THEN RAISE EXCEPTION 'Address constraint not found'; END IF;
ALTER TABLE public.temp_mail_inboxes DROP CONSTRAINT temp_mail_inboxes_address_check;
EXECUTE 'ALTER TABLE public.temp_mail_inboxes ADD CONSTRAINT temp_mail_inboxes_address_check CHECK (('||old_expr||') OR address ~ '||quote_literal('^[a-f0-9]{5,10}@(birch|meadow)[.]vxcladskz[.]help$')||')';
END $b$;
CREATE OR REPLACE FUNCTION public.create_temp_mail_inbox(p_domain text) RETURNS public.temp_mail_inboxes LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
DECLARE result public.temp_mail_inboxes;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='28000'; END IF;
IF p_domain IS NULL OR p_domain NOT IN ('birch.vxcladskz.help','meadow.vxcladskz.help') THEN RAISE EXCEPTION 'Unsupported receiving domain' USING errcode='22023'; END IF;
FOR attempt IN 1..20 LOOP
BEGIN
INSERT INTO public.temp_mail_inboxes(user_id,address) VALUES(auth.uid(),left(replace(gen_random_uuid()::text,'-',''),5+floor(random()*6)::int)||'@'||p_domain) RETURNING * INTO result;
RETURN result;
EXCEPTION WHEN unique_violation THEN
END;
END LOOP;
RAISE EXCEPTION 'Please retry generating an address';
END; $f$;
CREATE OR REPLACE FUNCTION public.create_temp_mail_inbox() RETURNS public.temp_mail_inboxes LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ select public.create_temp_mail_inbox('birch.vxcladskz.help'::text); $f$;
DO $b$ DECLARE old_expr text; BEGIN
SELECT pg_get_expr(conbin,conrelid) INTO old_expr FROM pg_constraint WHERE conrelid='public.temp_mail_inboxes'::regclass AND conname='temp_mail_inboxes_cvxlwasd_domain_check';
IF old_expr IS NULL THEN RAISE EXCEPTION 'Domain constraint not found'; END IF;
ALTER TABLE public.temp_mail_inboxes DROP CONSTRAINT temp_mail_inboxes_cvxlwasd_domain_check;
EXECUTE 'ALTER TABLE public.temp_mail_inboxes ADD CONSTRAINT temp_mail_inboxes_vxcladskz_domain_check CHECK (('||old_expr||') OR address ~ '||quote_literal('^[a-f0-9]{5,10}@(birch|meadow)[.]vxcladskz[.]help$')||') NOT VALID';
END $b$;