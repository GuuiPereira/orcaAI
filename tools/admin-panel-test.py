"""Teste do painel admin (Fase 6) contra a stack LOCAL, com duas contas: A vira
admin, B é um usuário comum que não pode alcançar nada do painel.

Uso: python3 tools/admin-panel-test.py
Sobe com: supabase functions serve --env-file supabase/functions/interpret-quote/.env.local
(as checagens de limite fazem chamadas reais à IA - centavos de dólar).
"""
import json, subprocess, sys, time, urllib.request, urllib.error

ROOT = "/home/guilherme/Projetos/OrçaAI"
BASE = "http://127.0.0.1:54321"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SECRET = json.loads(subprocess.run(
    [f"{ROOT}/node_modules/.bin/supabase", "status", "-o", "json"], capture_output=True, text=True, cwd=ROOT,
).stdout)["SECRET_KEY"]


def http(method, path, token=None, body=None, apikey=ANON, extra=None):
    headers = {"apikey": apikey, "Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    if extra: headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t


def psql(sql):
    return subprocess.run(["docker", "exec", "supabase_db_orcaai", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
                          capture_output=True, text=True).stdout.strip()


def ok(label, cond, detail=""):
    print(("PASSOU  " if cond else "FALHOU  ") + label + (f"  [{detail}]" if detail else ""))
    if not cond: ok.failed += 1
ok.failed = 0


def make_account(tag):
    email = f"adm-{tag}-{int(time.time() * 1000)}@orcaai.local"
    st, d = http("POST", "/auth/v1/signup", body={"email": email, "password": "senha-teste-123"})
    token, uid = d["access_token"], d["user"]["id"]
    http("POST", "/rest/v1/organizations", token, {"owner_user_id": uid, "trade_name": f"Empresa {tag}"})
    org = http("GET", f"/rest/v1/organizations?owner_user_id=eq.{uid}&select=id", token)[1][0]["id"]
    http("POST", "/rest/v1/organization_members", token, {"organization_id": org, "user_id": uid, "role": "owner", "status": "active"})
    return dict(token=token, uid=uid, org=org, email=email)


A = make_account("admin")
B = make_account("comum")
psql(f"insert into platform_admins (user_id) values ('{A['uid']}')")

# ---------------------------------------------------------------- passo 1
print("== passo 1: quem é admin, auditoria append-only")
st, d = http("POST", "/rest/v1/rpc/is_platform_admin", A["token"], {})
ok("is_platform_admin() = true para o admin", st == 200 and d is True, f"{st} {d}")
st, d = http("POST", "/rest/v1/rpc/is_platform_admin", B["token"], {})
ok("is_platform_admin() = false para usuário comum", st == 200 and d is False, f"{st} {d}")
st, d = http("POST", "/rest/v1/rpc/is_platform_admin", None, {})
ok("is_platform_admin() sem login é recusada", st in (401, 403), str(st))

for table in ("platform_admins", "admin_actions"):
    for who, acc in (("admin", A), ("comum", B)):
        st, d = http("GET", f"/rest/v1/{table}?select=*", acc["token"])
        ok(f"{table}: {who} NÃO lê pela API", st in (401, 403) or d == [], f"{st} {d}")

st, d = http("POST", "/rest/v1/platform_admins", B["token"], {"user_id": B["uid"]})
ok("usuário comum NÃO consegue se promover a admin", st in (401, 403), f"{st} {d}")
st, d = http("POST", "/rest/v1/admin_actions", A["token"],
             {"admin_user_id": A["uid"], "action": "suspend", "organization_id": B["org"], "reason": "teste"})
ok("nem o admin grava auditoria direto pela API (só a function)", st in (401, 403), f"{st} {d}")

st, d = http("POST", "/rest/v1/admin_actions", None,
             {"admin_user_id": A["uid"], "action": "suspend", "organization_id": B["org"], "reason": "via service role"},
             apikey=SECRET, extra={"Prefer": "return=representation"})
ok("service_role grava auditoria", st == 201, f"{st} {d}")
action_id = d[0]["id"] if st == 201 else None
st, d = http("PATCH", f"/rest/v1/admin_actions?id=eq.{action_id}", None, {"reason": "reescrito"}, apikey=SECRET)
ok("auditoria é append-only: nem a service_role altera", st in (401, 403), f"{st} {d}")
st, d = http("DELETE", f"/rest/v1/admin_actions?id=eq.{action_id}", None, apikey=SECRET)
ok("auditoria é append-only: nem a service_role apaga", st in (401, 403), f"{st} {d}")
st, d = http("POST", "/rest/v1/admin_actions", None,
             {"admin_user_id": A["uid"], "action": "suspend", "organization_id": B["org"], "reason": " "}, apikey=SECRET)
ok("ação sem motivo é recusada", st == 400, f"{st} {d}")
st, d = http("POST", "/rest/v1/admin_actions", None,
             {"admin_user_id": A["uid"], "action": "apagar_tudo", "organization_id": B["org"], "reason": "ação inventada"}, apikey=SECRET)
ok("ação fora da lista é recusada", st == 400, f"{st} {d}")

# ---------------------------------------------------------------- passo 2
print("== passo 2: leitura do painel, só metadados")
# Conteúdo sensível na conta B - nada disso pode sair na resposta do painel.
SECRET_TEXT = "Pintura da casa da Dona Josefina Sensivel, rua Secreta 123"
http("POST", "/rest/v1/customers", B["token"],
     {"organization_id": B["org"], "name": "Josefina Sensivel", "phone": "11 97777-1234", "email": "josefina@segredo.com"})
http("POST", "/rest/v1/quotes", B["token"], {"organization_id": B["org"], "source_text": SECRET_TEXT, "status": "rascunho"})
quote_b = http("GET", f"/rest/v1/quotes?organization_id=eq.{B['org']}&select=id", B["token"])[1][0]["id"]
http("POST", "/rest/v1/quote_events", B["token"], {"quote_id": quote_b, "event_type": "criado"})
psql(f"insert into ai_interpretations (quote_id, status, error) values ('{quote_b}', 'falhou', 'ai_request_failed')")
psql(f"insert into input_extractions (organization_id, kind, model, status, error) values ('{B['org']}', 'audio', 'gpt-transcribe', 'falhou', 'no_text')")

st, d = http("POST", "/rest/v1/rpc/admin_list_organizations", A["token"], {})
row_b = next((r for r in d if r["organization_id"] == B["org"]), None) if st == 200 else None
ok("admin lista as organizações", st == 200 and row_b is not None, f"{st}")
ok("lista traz contagens de B (1 orçamento, 1 interpretação, 1 leitura)",
   row_b and row_b["quotes_total"] == 1 and row_b["interpretations_30d"] == 1 and row_b["extractions_30d"] == 1, str(row_b))
st, d = http("POST", "/rest/v1/rpc/admin_list_organizations", B["token"], {})
ok("usuário comum NÃO lista organizações", st == 403, f"{st} {d}")
st, d = http("POST", "/rest/v1/rpc/admin_list_organizations", None, {})
ok("sem login NÃO lista organizações", st in (401, 403), str(st))

st, detail = http("POST", "/rest/v1/rpc/admin_organization_detail", A["token"], {"target_organization_id": B["org"]})
ok("admin abre o detalhe de B", st == 200 and isinstance(detail, dict), f"{st}")
if st == 200:
    ok("detalhe tem as seções esperadas",
       set(detail) == {"organization", "members", "daily", "recent_errors", "timeline", "admin_actions"}, str(sorted(detail)))
    ok("uso diário cobre 30 dias", len(detail["daily"]) == 30, str(len(detail["daily"])))
    ok("erros recentes trazem só o código (interpretação e áudio)",
       {e["code"] for e in detail["recent_errors"]} == {"ai_request_failed", "no_text"}, str(detail["recent_errors"]))
    ok("linha do tempo traz o evento 'criado'", any(e["event"] == "criado" for e in detail["timeline"]), str(detail["timeline"]))
    ok("a ação de admin do passo 1 aparece no detalhe", any(a["action"] == "suspend" for a in detail["admin_actions"]))
    dump = json.dumps(detail, ensure_ascii=False)
    leaked = [s for s in ("Josefina", "97777", "segredo.com", "Secreta", SECRET_TEXT, B["email"]) if s in dump]
    ok("NENHUM conteúdo sai no detalhe (texto, cliente, telefone, e-mail)", leaked == [], str(leaked))
st, d = http("POST", "/rest/v1/rpc/admin_organization_detail", B["token"], {"target_organization_id": B["org"]})
ok("usuário comum NÃO abre detalhe (nem da própria organização)", st == 403, f"{st} {d}")
st, d = http("POST", "/rest/v1/rpc/admin_organization_detail", A["token"],
             {"target_organization_id": "00000000-0000-4000-8000-000000000000"})
ok("organização inexistente dá 404", st == 404, f"{st} {d}")

print()
print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)")
sys.exit(1 if ok.failed else 0)
