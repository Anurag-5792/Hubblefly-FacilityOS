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
     +privilege_gate(target,baseline["registry_privileges"])+shape_gate(target)+append_sql(claim)+"COMMIT;\n")
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
# Bind all preexisting role identities, flags, grant edges and effective rights.
PRIVILEGES=r"""
SELECT jsonb_build_object(
 'roles',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.oid),'[]'::jsonb) FROM (
   SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig,
    pg_has_role(oid,'pg_read_all_data','USAGE') AS read_all,pg_has_role(oid,'pg_write_all_data','USAGE') AS write_all,
    pg_has_role(oid,'pg_maintain','USAGE') AS maintain_all,
    pg_has_role(oid,'pg_read_all_data','SET') AS set_read,pg_has_role(oid,'pg_write_all_data','SET') AS set_write,
    pg_has_role(oid,'pg_maintain','SET') AS set_maintain,
    pg_has_role(oid,session_user,'USAGE') AS actor_usage,pg_has_role(oid,session_user,'SET') AS actor_set
   FROM pg_roles) q),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.roleid,q.member,q.grantor),'[]'::jsonb) FROM (
   SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members) q)
)
"""
def catalog_query(frozen):
    return "SELECT (("+frozen.strip().rstrip(";")+")::jsonb || jsonb_build_object('registry_privileges',("+PRIVILEGES+")))::text"
def admin_names(target):
    return {target["installer"],"neon_superuser","neon_service",
            "cloud_admin" if target["database"]=="hft_r1_retained_masters_np077" else "postgres",
            "pg_read_all_data","pg_write_all_data","pg_maintain"}
def eligible(p,target):
    roles={x["rolname"]:x for x in p["roles"]}
    need(OWNER not in roles,"HF100_ALREADY_CONSUMED_OR_REGISTRY_COLLISION")
    allowed=admin_names(target)
    for x in roles.values():
        if any(x[k] for k in ("rolsuper","read_all","write_all","maintain_all","set_read","set_write","set_maintain","actor_usage","actor_set")):
            need(x["rolname"] in allowed,"HF100_UNEXPECTED_PRIVILEGED_PRINCIPAL")
    if target["database"]=="hft_r1_retained_masters_np077":
        for name,oid in ((target["installer"],16393),("neon_superuser",16384),("neon_service",16395),("cloud_admin",10),
                         ("pg_read_all_data",6181),("pg_write_all_data",6182),("pg_maintain",6337)):
            need(name in roles and roles[name]["oid"]==str(oid),"HF100_PROVIDER_IDENTITY_DRIFT")
        for name in (target["installer"],"neon_superuser","neon_service"):
            x=roles[name]
            need(not x["rolsuper"] and x["read_all"] and x["write_all"] and x["maintain_all"],"HF100_PROVIDER_RIGHTS_DRIFT")
        need(roles["cloud_admin"]["rolsuper"],"HF100_PROVIDER_ADMIN_DRIFT")
def without_registry(p):
    ids={x["oid"] for x in p["roles"] if x["rolname"]==OWNER}
    return {"roles":[x for x in p["roles"] if x["oid"] not in ids],
            "memberships":[x for x in p["memberships"] if not ids.intersection((x["roleid"],x["member"],x["grantor"]))]}
def baseline_gate(p):
    # Frozen installation adds roles. Preserve all original identities and
    # membership edges between them; inspect effective access for every role.
    ids=",".join(str(int(x["oid"])) for x in p["roles"])
    need(ids,"HF100_PRIVILEGE_BASELINE_REQUIRED")
    q="SELECT jsonb_build_object('roles',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'oid')::oid) FROM jsonb_array_elements(v->'roles') x WHERE (x->>'oid')::oid IN ("+ids+")),'[]'::jsonb),'memberships',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'roleid')::oid,(x->>'member')::oid,(x->>'grantor')::oid) FROM jsonb_array_elements(v->'memberships') x WHERE (x->>'roleid')::oid IN ("+ids+") AND (x->>'member')::oid IN ("+ids+") AND (x->>'grantor')::oid IN ("+ids+")),'[]'::jsonb)) FROM ("+PRIVILEGES+") AS snapshot(v)"
    return equality_gate(q,p,"HF100_PRIVILEGE_BASELINE_DRIFT")
def privilege_gate(target,p):
    i=literal(target["installer"]);o=literal(OWNER)
    allowed=",".join(literal(x["rolname"]) for x in p["roles"] if x.get("rolname") in admin_names(target)) or "NULL"
    return baseline_gate(p)+"""DO $$ DECLARE r oid; actor oid; f oid; t oid; BEGIN
 SELECT oid INTO STRICT r FROM pg_roles WHERE rolname="""+o+""" AND NOT(rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls);
 SELECT oid INTO STRICT actor FROM pg_roles WHERE rolname="""+i+""";
 SELECT 'public.hf100_append_receipt(text,text)'::regprocedure::oid,'public.hf100_install_receipt'::regclass::oid INTO f,t;
 IF pg_has_role(actor,r,'SET') OR pg_has_role(actor,r,'USAGE') OR has_schema_privilege(r,'public','CREATE')
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r OR (roleid=r AND NOT COALESCE(member=actor AND grantor IN(actor,(SELECT oid FROM pg_roles WHERE rolname='cloud_admin'),(SELECT oid FROM pg_roles WHERE rolname='postgres')) AND admin_option AND NOT set_option AND NOT inherit_option,false)))
 OR EXISTS(SELECT 1 FROM pg_roles x WHERE x.oid<>r AND (
   (x.rolname NOT IN ("""+allowed+""") AND (x.rolsuper OR pg_has_role(x.oid,actor,'USAGE') OR pg_has_role(x.oid,actor,'SET')
    OR pg_has_role(x.oid,'pg_read_all_data','SET') OR pg_has_role(x.oid,'pg_write_all_data','SET') OR pg_has_role(x.oid,'pg_maintain','SET')
    OR pg_has_role(x.oid,r,'SET') OR pg_has_role(x.oid,r,'USAGE')))
   OR has_table_privilege(x.oid,t,'SELECT') IS DISTINCT FROM (x.rolsuper OR x.oid=actor OR pg_has_role(x.oid,'pg_read_all_data','USAGE'))
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) k WHERE has_table_privilege(x.oid,t,k) IS DISTINCT FROM (x.rolsuper OR pg_has_role(x.oid,'pg_write_all_data','USAGE')))
   OR has_table_privilege(x.oid,t,'MAINTAIN') IS DISTINCT FROM (x.rolsuper OR pg_has_role(x.oid,'pg_maintain','USAGE'))
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER','SELECT WITH GRANT OPTION','INSERT WITH GRANT OPTION','UPDATE WITH GRANT OPTION','DELETE WITH GRANT OPTION','TRUNCATE WITH GRANT OPTION','REFERENCES WITH GRANT OPTION','TRIGGER WITH GRANT OPTION','MAINTAIN WITH GRANT OPTION']) k WHERE has_table_privilege(x.oid,t,k) IS DISTINCT FROM x.rolsuper)
   OR has_function_privilege(x.oid,f,'EXECUTE') IS DISTINCT FROM (x.rolsuper OR x.oid=actor)
   OR has_function_privilege(x.oid,f,'EXECUTE WITH GRANT OPTION') IS DISTINCT FROM x.rolsuper
   OR (x.rolname NOT IN ("""+allowed+""") AND (has_table_privilege(x.oid,t,'SELECT,INSERT,UPDATE,DELETE,MAINTAIN') OR has_function_privilege(x.oid,f,'EXECUTE')))
 ))
 THEN RAISE EXCEPTION 'HF100_REGISTRY_PRIVILEGE_DRIFT'; END IF;
END $$;
"""
def shape_gate(target):
    owner=OWNER;installer=target["installer"]
    expected={
      "relations":[{"name":"hf100_install_receipt","kind":"r","owner":owner,"acl":sorted([owner+"=arwdDxtm/"+owner,installer+"=r/"+owner]),"rls":False,"force_rls":False},
                   {"name":"hf100_install_receipt_pkey","kind":"i","owner":owner,"acl":[],"rls":False,"force_rls":False}],
      "types":[{"name":"_hf100_install_receipt","owner":owner},{"name":"hf100_install_receipt","owner":owner}],
      "functions":[{"name":"hf100_append_receipt","owner":owner,"definer":True,"config":["search_path=pg_catalog, pg_temp"],"body":body(target),"acl":sorted([owner+"=X/"+owner,installer+"=X/"+owner])}],
      "columns":[{"name":n,"type":t,"notnull":True,"acl":None} for n,t in (("seq","integer"),("raw","text"),("sha","text"))],
      "constraints":sorted(["PRIMARY KEY (seq)","CHECK (((seq >= 0) AND (seq <= 2)))","CHECK ((octet_length(raw) <= 1048576))","CHECK ((sha ~ '^[0-9a-f]{64}$'::text))"]),
      "indexes":["CREATE UNIQUE INDEX hf100_install_receipt_pkey ON public.hf100_install_receipt USING btree (seq)"],"triggers":0,"rules":0}
    q="""SELECT (v-'rows'-'functions'-'constraints') || jsonb_build_object(
 'functions',(SELECT jsonb_agg(x-'definition') FROM jsonb_array_elements(v->'functions') x),
 'constraints',(SELECT jsonb_agg(x ORDER BY x COLLATE "C") FROM jsonb_array_elements_text(v->'constraints') x))
 FROM (SELECT ("""+SHAPE.strip()+""")::jsonb AS v) s"""
    # Exact key/array comparison; sort constraint names in byte order rather
    # than the server's locale. Report only the failing field, never its value.
    return """DO $hf100_shape$ DECLARE observed jsonb; expected jsonb; k text; BEGIN
 observed:=("""+q+"""); expected:=convert_from(decode('"""+canonical(expected).hex()+"""','hex'),'UTF8')::jsonb;
 IF observed IS DISTINCT FROM expected THEN
  SELECT key INTO k FROM jsonb_object_keys(expected || observed) AS key WHERE observed->key IS DISTINCT FROM expected->key ORDER BY key LIMIT 1;
  RAISE EXCEPTION 'HF100_REGISTRY_EXPLICIT_SHAPE_DRIFT:%',k;
 END IF;
END $hf100_shape$;
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
    a["registry_privileges"]=without_registry(a["registry_privileges"])
    need(a==original,"HF100_REGISTRY_BASELINE_DELTA_DENIED")
def check_rows(shape,raws):
    need(shape["rows"]==[{"seq":i,"raw":raw.decode(),"sha":sha(raw)} for i,raw in enumerate(raws)],"HF100_REGISTRY_RECEIPT_CHAIN_DRIFT")
def install_fence(target,shape,p):
    return lock()+identity_gate(target)+privilege_gate(target,p)+shape_gate(target)+equality_gate(SHAPE,shape,"HF100_PREPARED_REGISTRY_DRIFT")
