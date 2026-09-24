import json, subprocess, sys, time, urllib.request, urllib.error

BASE = "http://127.0.0.1:54321"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SECRET = json.loads(subprocess.run("pnpm exec supabase status -o json 2>/dev/null", shell=True, capture_output=True, text=True, cwd="/home/guilherme/Projetos/OrçaAI").stdout)["SECRET_KEY"]

def call(method, path, token=None, body=None, apikey=ANON, raw=None, ctype="application/json", extra=None):
    headers = {"apikey": apikey, "Content-Type": ctype}
    if token: headers["Authorization"] = f"Bearer {token}"
    if extra: headers.update(extra)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode(); return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try: return e.code, json.loads(txt)
        except Exception: return e.code, txt

def psql(sql):
    return subprocess.run(["docker", "exec", "supabase_db_orcaai", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql], capture_output=True, text=True).stdout.strip()

def ok(label, cond, detail=""):
    print(("PASSOU  " if cond else "FALHOU  ") + label + (f"  [{detail}]" if detail else ""))
    if not cond: ok.failed += 1
ok.failed = 0

def make_account(tag):
    email = f"del-{tag}-{int(time.time())}@orcaai.local"
    st, d = call("POST", "/auth/v1/signup", body={"email": email, "password": "senha-teste-123"})
    token, uid = d["access_token"], d["user"]["id"]
    st, org = call("POST", "/rest/v1/organizations", token, {"owner_user_id": uid, "trade_name": f"Empresa {tag}"}, extra={"Prefer": "return=representation"})
    org_id = org[0]["id"]
    call("POST", "/rest/v1/organization_members", token, {"organization_id": org_id, "user_id": uid, "role": "owner", "status": "active"})
    st, cust = call("POST", "/rest/v1/customers", token, {"organization_id": org_id, "name": f"Cliente {tag}"}, extra={"Prefer": "return=representation"})
    st, q = call("POST", "/rest/v1/quotes", token, {"organization_id": org_id, "customer_id": cust[0]["id"], "source_text": "x"}, extra={"Prefer": "return=representation"})
    qid = q[0]["id"]
    # arquivos nos dois buckets
    st1, _ = call("POST", f"/storage/v1/object/logos/{org_id}/logo.png", token, raw=b"png-fake", ctype="image/png")
    st2, _ = call("POST", f"/storage/v1/object/quote-pdfs/{org_id}/{qid}/1.pdf", token, raw=b"%PDF-fake", ctype="application/pdf")
    assert st1 == 200 and st2 == 200, (st1, st2)
    return dict(email=email, token=token, uid=uid, org=org_id, quote=qid)

A = make_account("A"); B = make_account("B")
print(f"contas criadas: A org {A['org'][:8]}, B org {B['org'][:8]}")

def objs(org): return int(psql(f"select count(*) from storage.objects where name like '{org}/%'"))
ok("A tem 2 arquivos no Storage", objs(A["org"]) == 2, str(objs(A["org"])))

# --- pedir exclusão
st, d = call("POST", "/functions/v1/delete-account", A["token"], {"action": "request"})
ok("A pede exclusão -> agenda ~7 dias", st == 200 and d.get("scheduled_for"), str(d))
first = d["scheduled_for"]
st, d = call("POST", "/functions/v1/delete-account", A["token"], {"action": "request"})
ok("pedir de novo é idempotente (mantém o prazo)", d.get("scheduled_for") == first)
days = float(psql(f"select extract(epoch from (scheduled_for - requested_at))/86400 from account_deletion_requests where user_id='{A['uid']}'"))
ok("prazo é de 7 dias", abs(days - 7) < 0.01, f"{days:.2f} dias")

# --- A só enxerga o próprio pedido; B não enxerga o de A
st, d = call("GET", "/rest/v1/account_deletion_requests?select=user_id", A["token"])
ok("A enxerga o próprio pedido", st == 200 and len(d) == 1)
st, d = call("GET", "/rest/v1/account_deletion_requests?select=user_id", B["token"])
ok("B NÃO enxerga pedido de ninguém", st == 200 and d == [], str(d))
st, d = call("POST", "/rest/v1/account_deletion_requests", B["token"], {"user_id": B["uid"], "scheduled_for": "2020-01-01T00:00:00Z"})
ok("usuário comum NÃO consegue inserir pedido direto (RLS/grant)", st in (401, 403), str(st))
st, d = call("DELETE", f"/rest/v1/account_deletion_requests?user_id=eq.{A['uid']}", B["token"])
ok("B NÃO consegue apagar o pedido de A", st in (401, 403) or psql(f"select count(*) from account_deletion_requests where user_id='{A['uid']}'") == "1")

# --- durante a janela: A bloqueada de gastar IA / emitir; B normal
st, d = call("POST", "/functions/v1/interpret-quote", A["token"], {"quote_id": A["quote"]})
ok("interpret-quote bloqueia conta com exclusão agendada (403)", st == 403, f"{st} {d}")
st, d = call("POST", "/functions/v1/issue-quote", A["token"], {"quote_id": A["quote"], "items": [], "discount": None, "commercial_terms": {}})
ok("issue-quote bloqueia conta com exclusão agendada (403)", st == 403, f"{st} {d}")
st, d = call("POST", "/functions/v1/issue-quote", B["token"], {"quote_id": B["quote"], "items": [], "discount": None, "commercial_terms": {}})
ok("conta B segue normal (400 de validação, não 403)", st == 400, f"{st}")

# --- cancelar e pedir de novo
st, d = call("POST", "/functions/v1/delete-account", A["token"], {"action": "cancel"})
ok("A cancela a exclusão", st == 200 and d.get("scheduled_for") is None)
ok("pedido removido no banco", psql(f"select count(*) from account_deletion_requests where user_id='{A['uid']}'") == "0")
st, d = call("POST", "/functions/v1/issue-quote", A["token"], {"quote_id": A["quote"], "items": [], "discount": None, "commercial_terms": {}})
ok("depois de cancelar, A volta a operar (400, não 403)", st == 400, f"{st}")
call("POST", "/functions/v1/delete-account", A["token"], {"action": "request"})

# --- purge: só com chave secret
st, d = call("POST", "/functions/v1/purge-deleted-accounts")
ok("purge sem credencial é recusada", st == 401, str(st))
st, d = call("POST", "/functions/v1/purge-deleted-accounts", A["token"])
ok("purge com JWT de usuário é recusada", st in (401, 403), str(st))

# --- antes do prazo: purge NÃO apaga
st, d = call("POST", "/functions/v1/purge-deleted-accounts", apikey=SECRET)
ok("purge antes do prazo não apaga ninguém", st == 200 and d.get("deleted") == 0, str(d))
ok("A ainda existe", psql(f"select count(*) from auth.users where id='{A['uid']}'") == "1")

# --- vence o prazo -> purge apaga
psql(f"update account_deletion_requests set scheduled_for = now() - interval '1 hour' where user_id='{A['uid']}'")
st, d = call("POST", "/functions/v1/purge-deleted-accounts", apikey=SECRET)
ok("purge após o prazo apaga 1 conta", st == 200 and d.get("deleted") == 1 and d.get("failed") == 0, str(d))

ok("usuário A sumiu do Auth", psql(f"select count(*) from auth.users where id='{A['uid']}'") == "0")
ok("organização de A sumiu", psql(f"select count(*) from organizations where id='{A['org']}'") == "0")
ok("orçamentos/clientes de A sumiram (cascata)", psql(f"select (select count(*) from quotes where organization_id='{A['org']}') + (select count(*) from customers where organization_id='{A['org']}')") == "0")
ok("perfil/membro de A sumiram", psql(f"select (select count(*) from profiles where id='{A['uid']}') + (select count(*) from organization_members where user_id='{A['uid']}')") == "0")
ok("arquivos de A no Storage foram apagados", objs(A["org"]) == 0, str(objs(A["org"])))
ok("pedido de exclusão de A sumiu", psql(f"select count(*) from account_deletion_requests where user_id='{A['uid']}'") == "0")

# --- B intacta
ok("usuário B intacto", psql(f"select count(*) from auth.users where id='{B['uid']}'") == "1")
ok("organização, cliente e orçamento de B intactos", psql(f"select (select count(*) from organizations where id='{B['org']}') + (select count(*) from customers where organization_id='{B['org']}') + (select count(*) from quotes where id='{B['quote']}')") == "3")
ok("arquivos de B no Storage intactos", objs(B["org"]) == 2, str(objs(B["org"])))
st, d = call("GET", "/rest/v1/quotes?select=id", B["token"])
ok("B ainda lê seus orçamentos pela API", st == 200 and len(d) == 1)

print()
print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)")
sys.exit(1 if ok.failed else 0)
