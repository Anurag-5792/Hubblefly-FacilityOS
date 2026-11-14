#!/usr/bin/env python3
"""One-use exact-baseline R77 source correction. No SQL or database execution.
Only four STOP-guarded candidates may change. Canonical migrations, ACLs,
HTTP gates and previous 076 candidates are untouched.
"""
from pathlib import Path
import hashlib
import json
import argparse
BASE = '4b192d2581542ebacafd0f6fee9e7d1b4055f8d6'
PREFIX = 'db/security/'
WRITER = PREFIX+'HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql'
PROOF = PREFIX+'HFT-R1-OPS-A2-PROOF-AUTHORITY-NONEXECUTABLE.sql'
READ = PREFIX+'HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql'
FULL = PREFIX+'HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql'
BLOBS = {
 WRITER:'91435f97a1ed3963ba1d00b455b87eb98f331d5e',
 PROOF:'857b9eb225ca5b1c766dc81993d82540d77b5879',
 READ:'8d74a7e0ec902efd06a7a1fac55abd440b427e29',
 FULL:'051906864ed4413fef7359aa7eff98221d9517a1',
}
STOP = "RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'"
HEADER_LOCK = """ -- R77-R01: take the document UPDATE lock BEFORE the source verifier's
 -- shared locks. All lines contribute to header status, including other items.
 -- SERIALIZABLE rejects a header changed after this transaction's snapshot;
 -- this writer never retries with a new nonce or a changed source revision.
 IF action='RECEIVE' THEN
  SELECT g.* INTO receive_grn FROM hft.grn AS g
  JOIN hft.warehouse AS w ON w.legal_entity_id=g.legal_entity_id
   AND w.warehouse_id=g.warehouse_id
  WHERE g.id::text=p->>'sourceDocumentId' AND g.legal_entity_id=e
   AND g.warehouse_id=wh AND w.site_id=site
   AND g.authorization_revision=(p->>'sourceRevision')::bigint
   AND g.authorized_by=p->>'approvedBy'
   AND g.status IN('AUTHORIZED','PARTIALLY_RECEIVED')
  FOR UPDATE OF g;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_R77_GRN_HEADER_NOT_AUTHORIZED'; END IF;
  PERFORM 1 FROM hft.grn_line AS gl
  WHERE gl.grn_id=receive_grn.id AND gl.legal_entity_id=e
  ORDER BY gl.line_no FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_R77_GRN_HAS_NO_AUTHORIZED_LINES'; END IF;
  -- Reject pre-existing counter/status corruption; do not silently repair it.
  PERFORM hft.assert_grn_receipt_cumulative_v2(receive_grn.id);
 END IF;
"""
OLD_RECEIPT = """ IF action='RECEIVE' THEN
  SELECT r.id,r.line_no INTO receipt_uuid,receipt_line
  FROM hft.grn_partial_receipt r
  WHERE r.grn_id::text=p->>'sourceDocumentId'
   AND r.receipt_key||':'||r.line_no::text=p->>'sourceActionKey'
   AND r.legal_entity_id=e AND r.warehouse_id=wh
   AND r.location_id=p->>'destinationLeafId'
   AND r.ops_a2_product_version_code=ver
   AND r.ops_a2_item_code=item
   AND r.qc_state='ACCEPTED'
  FOR SHARE;
  IF receipt_uuid IS NULL THEN
   RAISE EXCEPTION 'OPS_A2_ORIGINAL_GRN_RECEIPT_NOT_VERIFIED'; END IF;
 END IF;
"""
EXACT_RECEIPT = """ -- R77-R02: one physical receipt, one exact signed quantity. A new
 -- partial delivery needs a different independently authorized receipt ID.
 IF action='RECEIVE' THEN
  BEGIN
   SELECT r.id,r.line_no INTO STRICT receipt_uuid,receipt_line
   FROM hft.grn_partial_receipt AS r
   WHERE r.grn_id=receive_grn.id
    AND r.receipt_key||':'||r.line_no::text=p->>'sourceActionKey'
    AND r.legal_entity_id=e AND r.warehouse_id=wh
    AND r.location_id=p->>'destinationLeafId'
    AND r.ops_a2_product_version_code=ver AND r.ops_a2_item_code=item
    AND r.batch_no=lot AND r.serial_no=serial
    AND r.qc_state='ACCEPTED'
    AND r.evidence_reference=p->>'inspectionEvidenceId'
    AND r.accepted_micro=qty
   FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
   RAISE EXCEPTION 'OPS_A2_ORIGINAL_GRN_RECEIPT_NOT_VERIFIED';
  END;
  PERFORM 1 FROM hft.stock_command WHERE source_receipt_id=receipt_uuid FOR SHARE;
  IF FOUND THEN RAISE EXCEPTION 'OPS_A2_R77_PHYSICAL_RECEIPT_ALREADY_POSTED'; END IF;
 END IF;
"""
STATUS_UPDATE = """  -- R77-R01: derive status from EVERY locked authorized line, not just
  -- the posted item. No authorization/revision/identity column is rewritten.
  SELECT count(*),COALESCE(sum(gl.ordered_micro::numeric),0),
   COALESCE(sum(gl.accepted_micro::numeric),0)
  INTO grn_lines,grn_ordered,grn_accepted
  FROM hft.grn_line AS gl WHERE gl.grn_id=receive_grn.id;
  IF grn_lines=0 OR grn_accepted<=0 OR grn_accepted>grn_ordered
   OR EXISTS(SELECT 1 FROM hft.grn_line AS gl WHERE gl.grn_id=receive_grn.id
    AND (gl.legal_entity_id<>e OR gl.accepted_micro<0
     OR gl.accepted_micro>gl.ordered_micro))
  THEN RAISE EXCEPTION 'OPS_A2_R77_GRN_CUMULATIVE_TOTAL_INVALID'; END IF;
  UPDATE hft.grn AS g
  SET status=CASE WHEN grn_accepted=grn_ordered THEN 'RECEIVED'
                 ELSE 'PARTIALLY_RECEIVED' END
  WHERE g.id=receive_grn.id AND g.legal_entity_id=e AND g.warehouse_id=wh
   AND g.authorization_revision=receive_grn.authorization_revision
   AND g.authorized_by=receive_grn.authorized_by AND g.status=receive_grn.status;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'OPS_A2_R77_GRN_STATUS_CAS_FAILED'; END IF;
  -- Same invariant also remains deferred at COMMIT in unchanged migration 0006.
  PERFORM hft.assert_grn_receipt_cumulative_v2(receive_grn.id);
"""
SEAL_RECEIPT = """ -- R77-R02: historical V2 seals must retain the exact original physical
 -- receipt quantity; a recomputed balanced -q/+q pair is not sufficient.
 IF c.kind='RECEIVE' AND NOT EXISTS(
  SELECT 1 FROM hft.grn_partial_receipt AS r
  WHERE r.id=c.source_receipt_id AND r.grn_id::text=c.source_document_id
   AND r.line_no=c.source_line_no
   AND r.receipt_key||':'||r.line_no::text=c.source_action_key
   AND r.legal_entity_id=c.legal_entity_id AND r.warehouse_id=c.warehouse_id
   AND r.location_id=c.ops_a2_destination_leaf
   AND r.ops_a2_item_code=c.item_code
   AND r.ops_a2_product_version_code=c.product_version_code
   AND r.batch_no=c.batch_no AND r.serial_no=c.serial_no
   AND r.qc_state='ACCEPTED' AND r.accepted_micro=c.quantity_micro
   AND r.evidence_reference=envelope.exact_payload->>'inspectionEvidenceId')
 THEN RAISE EXCEPTION 'OPS_A2_R77_SEALED_RECEIPT_QUANTITY_OR_IDENTITY_MISMATCH'; END IF;
"""
AUTH_EXACT = """ -- R77-R02: RECEIVE is not a divisible ISSUE/RETURN/TRANSFER ceiling.
 IF b.action_kind='RECEIVE' AND source_rev IS NOT NULL
  AND source_qty IS DISTINCT FROM b.authorized_micro
 THEN RAISE EXCEPTION 'OPS_A2_R77_EXACT_PHYSICAL_RECEIPT_QUANTITY_REQUIRED'; END IF;
"""
P0_EXACT = """  -- P0 HMAC was verified above; bind its exact decimal to the protected
  -- source quantity before asking the signer for a P2 command/proof.
  IF b.authorized_micro::numeric IS DISTINCT FROM
     ((p->>'quantity')::numeric*1000000)
  THEN RAISE EXCEPTION 'OPS_A2_R77_P0_RECEIPT_QUANTITY_MISMATCH'; END IF;
"""
def once(source: str, old: str, new: str) -> str:
 if source.count(old)!=1:raise ValueError('R77_EXACT_BASELINE_FRAGMENT_MISMATCH:'+old[:90])
 return source.replace(old,new,1)
def writer(source: str) -> str:
 source=once(source,' cmd_uuid uuid;outbox_uuid uuid;\n',
  ' cmd_uuid uuid;outbox_uuid uuid;\n receive_grn hft.grn%ROWTYPE;\n grn_lines bigint;grn_ordered numeric;grn_accepted numeric;\n')
 source=once(source,' binding:=hft.ops_a2_authorized_source_v2(p);\n',
  HEADER_LOCK+' binding:=hft.ops_a2_authorized_source_v2(p);\n'+EXACT_RECEIPT)
 source=once(source,OLD_RECEIPT,'')
 anchor="  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_INVOICE_OVER_RECEIPT'; END IF;\n"
 source=once(source,anchor,anchor+STATUS_UPDATE)
 anchor=' SELECT count(*),COALESCE(sum(qty_delta_micro),0)\n INTO nlegs,delta FROM hft.stock_entry WHERE command_id=p_id;'
 return once(source,anchor,SEAL_RECEIPT+anchor)
def proof(source: str) -> str:
 anchor=' IF source_rev IS NULL OR source_rev<>b.source_revision\n'
 return once(source,anchor,AUTH_EXACT+anchor)
def reader(source: str) -> str:
 anchor=" IF p->>'kind'='IN' THEN\n  IF p->>'qcState'<>'ACCEPTED' OR b.inspection_evidence_id<>p->>'qcEvidenceId'"
 return once(source,anchor," IF p->>'kind'='IN' THEN\n"+P0_EXACT+
  "  IF p->>'qcState'<>'ACCEPTED' OR b.inspection_evidence_id<>p->>'qcEvidenceId'")
def blob(data: bytes) -> str:
 return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def apply(root: Path) -> dict:
 original={path:(root/path).read_bytes() for path in BLOBS}
 for path,data in original.items():
  if blob(data)!=BLOBS[path]:raise ValueError('R77_UNREVIEWED_BASELINE:'+path)
 changed={WRITER:writer(original[WRITER].decode()),PROOF:proof(original[PROOF].decode()),
          READ:reader(original[READ].decode()),FULL:reader(proof(writer(original[FULL].decode())))}
 for path,text in changed.items():
  if text.count(STOP)!=original[path].decode().count(STOP):raise ValueError('R77_STOP_CHANGED:'+path)
 for path,start,tag in ((WRITER,'hft.ops_a2_post_stock_command_v2(', '$writer$;'),
  (WRITER,'hft.ops_a2_assert_command_seal_v2(', '$assertseal$;'),
  (PROOF,'hft.ops_a2_authorized_source_v2(', '$authorized$;'),
  (READ,'hft.ops_a2_resolve_authorized_v2(', '$resolve$;')):
  a=changed[path].index('CREATE OR REPLACE FUNCTION '+start)
  b=changed[path].index('END '+tag,a)+len('END '+tag)
  if changed[FULL].count(changed[path][a:b])!=1:raise ValueError('R77_COMPONENT_BUNDLE_DRIFT')
 manifest={}
 for path,text in changed.items():
  data=text.encode();(root/path).write_bytes(data)
  manifest[path]={'before_blob':BLOBS[path],'after_blob':blob(data),'after_sha256':hashlib.sha256(data).hexdigest()}
 return manifest
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
 print(json.dumps(apply(parser.parse_args().root),sort_keys=True,indent=2))
