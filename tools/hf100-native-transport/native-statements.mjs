/** HF100 connector-native SQL transport helper. NOT an installer or admission.
 * Input must come from the exact accepted, independently authorized SQL assembler.
 * No provider credentials, connection, target selection, claim or SQL execution.
 * Preserve all dollar-quoted bodies and statement text; translate ONLY the outer
 * transaction envelope for a single provider run_sql_transaction call.
 */
export function splitGuardedBody(s){
 if(typeof s!=='string'||s.includes('\0'))throw Error('HF100_INVALID_SQL_BODY');
 let out=[],start=0,i=0,mode='',dollar='',depth=0,code=false;
 while(i<s.length){
  const c=s[i],n=s[i+1];
  if(mode==='line'){if(c==='\n')mode='';i++;continue}
  if(mode==='block'){if(c==='/'&&n==='*'){depth++;i+=2}else if(c==='*'&&n==='/'){depth--;i+=2;if(!depth)mode=''}else i++;continue}
  if(mode==='dollar'){if(s.startsWith(dollar,i)){i+=dollar.length;mode=''}else i++;continue}
  if(mode==='single'||mode==='escape'){if(c==="'"&&n==="'"){i+=2;continue}if(mode==='escape'&&c==='\\'){i+=2;continue}if(c==="'")mode='';i++;continue}
  if(mode==='double'){if(c==='"'&&n==='"'){i+=2;continue}if(c==='"')mode='';i++;continue}
  if(c==='-'&&n==='-'){mode='line';i+=2;continue}if(c==='/'&&n==='*'){mode='block';depth=1;i+=2;continue}
  if(c==="'"){mode=(i>0&&/[Ee]/.test(s[i-1])&&(i===1||!/[A-Za-z0-9_$]/.test(s[i-2])))?'escape':'single';code=true;i++;continue}
  if(c==='"'){mode='double';code=true;i++;continue}
  if(c==='$'){let m=s.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);if(m){dollar=m[0];mode='dollar';code=true;i+=dollar.length;continue}}
  if(c===';'){if(code)out.push(s.slice(start,i+1));start=i+1;code=false;i++;continue}
  if(!/\s/.test(c))code=true;i++;
 }
 if(mode&&mode!=='line')throw Error('HF100_UNTERMINATED_SQL_TOKEN');
 if(code)throw Error('HF100_UNTERMINATED_SQL_STATEMENT');
 for(const x of out){
  // Remove leading comments with a nested-comment aware scan before checking
  // the top-level command. Do not alter the actual emitted statement.
  let j=0;for(;;){while(/\s/.test(x[j]||'')&&j<x.length)j++;
   if(x.startsWith('--',j)){const k=x.indexOf('\n',j+2);j=k<0?x.length:k+1;continue}
   if(x.startsWith('/*',j)){let d=1;j+=2;while(d&&j<x.length){if(x.startsWith('/*',j)){d++;j+=2}else if(x.startsWith('*/',j)){d--;j+=2}else j++}if(d)throw Error('HF100_UNTERMINATED_SQL_TOKEN');continue}break;}
  const y=x.slice(j);
  if(/^(?:BEGIN|COMMIT|ROLLBACK|END|ABORT|START\s+TRANSACTION|SAVEPOINT|RELEASE\s+SAVEPOINT|PREPARE\s+TRANSACTION|SET\s+(?:TRANSACTION|SESSION\s+CHARACTERISTICS)|COPY)\b/i.test(y)||y.startsWith('\\'))throw Error('HF100_NESTED_TRANSACTION_OR_CLIENT_COMMAND');
 }
 return out;
}
export function compileGuardedTransaction(sql){
 if(typeof sql!=='string')throw Error('HF100_INVALID_SQL_BODY');
 const m=sql.match(/^BEGIN (ISOLATION LEVEL SERIALIZABLE|READ ONLY);\n([\s\S]*)\nCOMMIT;\n?$/);
 if(!m)throw Error('HF100_EXACT_OUTER_TRANSACTION_REQUIRED');
 const statements=splitGuardedBody(m[2]);
 if(!statements.length)throw Error('HF100_EMPTY_TRANSACTION');
 return ['SET TRANSACTION '+m[1],...statements];
}
