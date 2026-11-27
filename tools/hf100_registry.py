"""HF100 durable fixed-target receipt ledger. The ledger is not WORM.
Registry objects live only in public so frozen V1 fresh-schema guard is intact.
All target mutation paths are called only after verified signed admission.
"""
from __future__ import annotations
import json
import re
from hashlib import sha256

OWNER="hft_r1_hf100_control_owner"
TABLE="public.hf100_install_receipt"
FN="public.hf100_append_receipt"
LOCK="HFT:HF100:RETAINED:OID16397:ROLES_ONLY"
TARGET_ACTION="retained-oid16397-canonical-roles-only"
PHASES=("CLAIM","PREPARED","TERMINAL")
def canonical(x):return (json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def sha(x):return sha256(x).hexdigest()
def need(x,code):
    if not x:raise RuntimeError(code)
def literal(s):return "'"+s.replace("'","''")+"'"
def ident(s):
    need(isinstance(s,str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}",s),"HF100_SQL_IDENTIFIER_INVALID")
    return '"'+s+'"'
def lock():return "SELECT pg_advisory_xact_lock(hashtextextended("+literal(LOCK)+",0));\n"
def equality_gate(query,value,label):
    return "DO $hf100_gate$ BEGIN IF ("+query.strip().rstrip(";")+")::jsonb IS DISTINCT FROM "+"convert_from(decode('"+canonical(value).hex()+"','hex'),'UTF8')::jsonb THEN RAISE EXCEPTION "+literal(label)+"; END IF; END $hf100_gate$;\n"
def identity_gate(target):
    return """DO $hf100_identity$ BEGIN
 IF current_database()<>"""+literal(target["database"])+""" OR
 (SELECT oid FROM pg_database WHERE datname=current_database())<>"""+str(int(target["database_oid"]))+""" OR
 current_setting('server_version_num')<>"""+literal(str(target["server_version_num"]))+""" OR session_user<>"""+literal(target["installer"])+""" OR current_user<>session_user OR pg_is_in_recovery()
 OR current_setting('session_replication_role')<>'origin'
 THEN RAISE EXCEPTION 'HF100_TARGET_IDENTITY_DENIED'; END IF;
END $hf100_identity$;
"""
def body(target):
    return """
DECLARE lastrow public.hf100_install_receipt%ROWTYPE; j jsonb; r jsonb; prior jsonb;
BEGIN
 IF session_user<>"""+literal(target["installer"])+""" OR current_database()<>"""+literal(target["database"])+"""
 OR (SELECT oid FROM pg_database WHERE datname=current_database())<>"""+str(int(target["database_oid"]))+"""
 OR pg_is_in_recovery() OR current_setting('server_version_num')<>"""+literal(str(target["server_version_num"]))+"""
 THEN RAISE EXCEPTION 'HF100_REGISTRY_CALLER_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('"""+LOCK+"""',0));
 IF p_raw IS NULL OR octet_length(p_raw)>1048576 OR p_sha IS NULL OR p_sha<>encode(sha256(convert_to(p_raw,'UTF8')),'hex')
 THEN RAISE EXCEPTION 'HF100_RECEIPT_DIGEST_DENIED'; END IF;
 j=p_raw::jsonb;r=j->'receipt';
 IF jsonb_typeof(j) IS DISTINCT FROM 'object' OR jsonb_typeof(r) IS DISTINCT FROM 'object'
 OR j->>'hmac_sha256' IS NULL OR j->>'hmac_sha256' !~ '^[0-9a-f]{64}$'
 OR r->>'schema' IS DISTINCT FROM 'HF100_RECEIPT_V3' OR r->>'target_action' IS DISTINCT FROM '"""+TARGET_ACTION+"""'
 OR r->>'order_sha256' IS NULL OR r->>'order_sha256' !~ '^[0-9a-f]{64}$'
 OR r->>'contract_sha256' IS NULL OR r->>'contract_sha256' !~ '^[0-9a-f]{64}$'
 OR r->>'attempt' IS NULL OR r->>'attempt' !~ '^[0-9a-f-]{36}$'
 OR r->>'phase' IS NULL OR r->>'phase' NOT IN ('CLAIM','PREPARED','TERMINAL')
 THEN RAISE EXCEPTION 'HF100_RECEIPT_FIELDS_DENIED'; END IF;
 SELECT * INTO lastrow FROM public.hf100_install_receipt ORDER BY seq DESC LIMIT 1;
 IF NOT FOUND THEN
  IF r->>'phase'<>'CLAIM' OR r->'previous_sha256' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'HF100_CLAIM_REQUIRED'; END IF;
  INSERT INTO public.hf100_install_receipt VALUES(0,p_raw,p_sha);
 ELSE
  prior=lastrow.raw::jsonb->'receipt';
  IF r->>'phase'='CLAIM' OR prior->>'phase'='TERMINAL' OR (prior->>'phase'='PREPARED' AND r->>'phase'<>'TERMINAL')
   OR r->>'previous_sha256' IS DISTINCT FROM lastrow.sha
   OR (r->>'order_sha256',r->>'contract_sha256',r->>'attempt') IS DISTINCT FROM (prior->>'order_sha256',prior->>'contract_sha256',prior->>'attempt')
  THEN RAISE EXCEPTION 'HF100_ALREADY_CONSUMED_OR_CHAIN_DENIED'; END IF;
  INSERT INTO public.hf100_install_receipt VALUES(lastrow.seq+1,p_raw,p_sha);
 END IF;
 RETURN p_sha;
END
"""
def append_sql(raw):
    return "SELECT "+FN+"("+"convert_from(decode('"+raw.hex()+"','hex'),'UTF8'),"+literal(sha(raw))+");\n"
def bootstrap(target,baseline_query,baseline,claim):
    installer=ident(target["installer"])
    return ("BEGIN ISOLATION LEVEL SERIALIZABLE;\nSET LOCAL search_path=pg_catalog,pg_temp;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\n"
     +lock()+identity_gate(target)+equality_gate(baseline_query,baseline,"HF100_PRECLAIM_BASELINE_DRIFT")+
     "DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+OWNER+"') OR to_regclass('"+TABLE+"') IS NOT NULL OR to_regprocedure('"+FN+"(text,text)') IS NOT NULL THEN RAISE EXCEPTION 'HF100_ALREADY_CONSUMED_OR_REGISTRY_COLLISION'; END IF; END $$;\n"
     "CREATE ROLE "+OWNER+" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;\n"
     "GRANT "+OWNER+" TO "+installer+" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;\n"
     "GRANT CREATE ON SCHEMA public TO "+OWNER+";\nSET LOCAL ROLE "+OWNER+";\n"
     "CREATE TABLE "+TABLE+"(seq integer PRIMARY KEY CHECK(seq BETWEEN 0 AND 2),raw text NOT NULL CHECK(octet_length(raw)<=1048576),sha text NOT NULL CHECK(sha~'^[0-9a-f]{64}$'));\n"
     "REVOKE ALL ON "+TABLE+" FROM PUBLIC;\n"
     "CREATE FUNCTION "+FN+"(p_raw text,p_sha text) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $hf100body$"+body(target)+"$hf100body$;\n"
     "REVOKE ALL ON FUNCTION "+FN+"(text,text) FROM PUBLIC;\n"
     "GRANT SELECT ON "+TABLE+" TO "+installer+";\nGRANT EXECUTE ON FUNCTION "+FN+"(text,text) TO "+installer+";\n"
     "RESET ROLE;\nREVOKE CREATE ON SCHEMA public FROM "+OWNER+";\nREVOKE "+OWNER+" FROM "+installer+" GRANTED BY CURRENT_USER;\n"
     +append_sql(claim)+"COMMIT;\n")
# Exact registry census is read independently, including all public objects.
# Definitions are checked against known source, not a caller-provided PASS.
SHAPE=r"""
SELECT jsonb_build_object(
 'relations',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind::text,'owner',pg_get_userbyid(c.relowner),
 'acl',coalesce((SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(c.relacl)x),'[]'::jsonb),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) ORDER BY c.relname),'[]'::jsonb)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'types',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.typname,'owner',pg_get_userbyid(t.typowner)) ORDER BY t.typname),'[]'::jsonb)
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'),
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid),'body',p.prosrc,
 'definer',p.prosecdef,'config',p.proconfig,'acl',coalesce((SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(p.proacl)x),'[]'::jsonb)) ORDER BY p.proname),'[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl) ORDER BY a.attnum),'[]'::jsonb)
 FROM pg_attribute a WHERE a.attrelid='public.hf100_install_receipt'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(pg_get_constraintdef(c.oid) ORDER BY pg_get_constraintdef(c.oid)),'[]'::jsonb) FROM pg_constraint c WHERE c.conrelid='public.hf100_install_receipt'::regclass AND c.contype<>'n'),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY pg_get_indexdef(indexrelid)),'[]'::jsonb) FROM pg_index WHERE indrelid='public.hf100_install_receipt'::regclass),
 'triggers',(SELECT count(*) FROM pg_trigger WHERE tgrelid='public.hf100_install_receipt'::regclass),
 'rules',(SELECT count(*) FROM pg_rewrite WHERE ev_class='public.hf100_install_receipt'::regclass),
 'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('seq',seq,'raw',raw,'sha',sha) ORDER BY seq),'[]'::jsonb) FROM public.hf100_install_receipt)
)::text
"""
def privilege_gate(target):
    i=literal(target["installer"]);o=literal(OWNER)
    return """DO $$ DECLARE r oid; actor oid; f oid; t oid; BEGIN
 SELECT oid INTO STRICT r FROM pg_roles WHERE rolname="""+o+""" AND NOT(rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls);
 SELECT oid INTO STRICT actor FROM pg_roles WHERE rolname="""+i+""";
 SELECT 'public.hf100_append_receipt(text,text)'::regprocedure::oid,'public.hf100_install_receipt'::regclass::oid INTO f,t;
 IF pg_has_role(actor,r,'SET') OR pg_has_role(actor,r,'USAGE') OR has_schema_privilege(r,'public','CREATE')
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r OR (roleid=r AND NOT COALESCE(member=actor AND grantor IN(actor,(SELECT oid FROM pg_roles WHERE rolname='cloud_admin'),(SELECT oid FROM pg_roles WHERE rolname='postgres')) AND admin_option AND NOT set_option AND NOT inherit_option,false)))
 OR NOT has_table_privilege(actor,t,'SELECT') OR has_table_privilege(actor,t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION')
 OR NOT has_function_privilege(actor,f,'EXECUTE') OR has_function_privilege(actor,f,'EXECUTE WITH GRANT OPTION')
 OR EXISTS(SELECT 1 FROM pg_roles x WHERE x.oid NOT IN(r,actor) AND NOT x.rolsuper AND (has_table_privilege(x.oid,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_function_privilege(x.oid,f,'EXECUTE')) AND x.rolname NOT LIKE 'pg\\_%')
 THEN RAISE EXCEPTION 'HF100_REGISTRY_PRIVILEGE_DRIFT'; END IF;
END $$;
"""
def verify_shape(s,target):
    owner=OWNER;installer=target["installer"]
    need([x["name"] for x in s["relations"]]==["hf100_install_receipt","hf100_install_receipt_pkey"] and
         [x["kind"] for x in s["relations"]]==["r","i"] and all(x["owner"]==owner and not x["rls"] and not x["force_rls"] for x in s["relations"]),"HF100_REGISTRY_RELATION_DRIFT")
    need(s["relations"][0]["acl"]==sorted([owner+"=arwdDxtm/"+owner,installer+"=r/"+owner]) and s["relations"][1]["acl"]==[],"HF100_REGISTRY_TABLE_ACL_DRIFT")
    need(s["types"]==[{"name":"_hf100_install_receipt","owner":owner},{"name":"hf100_install_receipt","owner":owner}],"HF100_REGISTRY_TYPE_DRIFT")
    fs=s["functions"];need(len(fs)==1 and fs[0]["name"]=="hf100_append_receipt" and fs[0]["owner"]==owner and fs[0]["definer"] is True and fs[0]["config"]==["search_path=pg_catalog, pg_temp"] and fs[0]["body"]==body(target) and fs[0]["acl"]==sorted([owner+"=X/"+owner,installer+"=X/"+owner]),"HF100_REGISTRY_FUNCTION_DRIFT")
    need(s["columns"]==[{"name":n,"type":t,"notnull":True,"acl":None} for n,t in (("seq","integer"),("raw","text"),("sha","text"))] and len(s["constraints"])==4 and len(s["indexes"])==1 and s["triggers"]==0 and s["rules"]==0,"HF100_REGISTRY_STRUCTURE_DRIFT")
    # Exact SQL-derived constraint expressions and index definition, not merely counts.
    need(set(s["constraints"])=={"PRIMARY KEY (seq)","CHECK (((seq >= 0) AND (seq <= 2)))","CHECK ((octet_length(raw) <= 1048576))","CHECK ((sha ~ '^[0-9a-f]{64}$'::text))"},"HF100_REGISTRY_CONSTRAINT_DRIFT")
    need(s["indexes"]==["CREATE UNIQUE INDEX hf100_install_receipt_pkey ON public.hf100_install_receipt USING btree (seq)"],"HF100_REGISTRY_INDEX_DRIFT")
def check_delta(original,after):
    # Exactly one table, one index, two types, one function in existing public.
    a=dict(after);a["user_objects"]-=5
    need(a==original,"HF100_REGISTRY_BASELINE_DELTA_DENIED")
def check_rows(shape,raws):
    need(shape["rows"]==[{"seq":i,"raw":raw.decode(),"sha":sha(raw)} for i,raw in enumerate(raws)],"HF100_REGISTRY_RECEIPT_CHAIN_DRIFT")
def install_fence(target,shape):
    return lock()+identity_gate(target)+privilege_gate(target)+equality_gate(SHAPE,shape,"HF100_PREPARED_REGISTRY_DRIFT")
