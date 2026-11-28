"""Actual disposable PG18 V3 guard campaign through the exact native lexer.
The transport double emulates the connector's one transaction, not its cloud
authentication or provider recovery service. Existing V3 encrypted recovery
and denial cases remain unchanged; never target a retained database.
"""
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def load(name,path):
    s=importlib.util.spec_from_file_location(name,ROOT/path)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
native=load("native","tools/hf100-native-transport/native-guarded.py")
fixture=load("fixture","tests/postgres/hf100_guarded_fixture.py")
original=fixture.FixturePg.exec
def execute(self,sql):
    # Original fixture used READ ONLY on a single line; normalize only its
    # outer wrapper to the reviewed native compiler's exact syntax.
    sql=sql.replace("BEGIN READ ONLY; SET LOCAL","BEGIN READ ONLY;\nSET LOCAL")
    statements=native.compile_transaction(sql,self.target)
    # A connector-equivalent one transaction, with exact native statements.
    result="BEGIN;\n"+"\n".join(x if x.rstrip().endswith(";") else x+";" for x in statements)+"\nCOMMIT;\n"
    return original(self,result)
fixture.FixturePg.exec=execute
if __name__=="__main__":
    fixture.main()
    print("HF100_NATIVE_STATEMENT_ASSEMBLY_PG18=PASS; original V3 guards and encrypted recovery through compiled transaction envelope")
