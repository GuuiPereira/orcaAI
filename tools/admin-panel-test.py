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

# ---------------------------------------------------------------- passo 3
print("== passo 3: ações (limite, suspensão, destravar) e onde são aplicadas")
import base64, uuid
# PNG 1x1 válido - a recusa por limite/suspensão vem antes de qualquer chamada à IA.
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def extract_image(token):
    b = uuid.uuid4().hex
    body = (f'--{b}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n'
            f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n').encode() \
        + PNG + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(BASE + "/functions/v1/extract-input", data=body, method="POST",
                                 headers={"apikey": ANON, "Authorization": f"Bearer {token}",
                                          "Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t


def admin(fn, acc, **args):
    return http("POST", f"/rest/v1/rpc/{fn}", acc["token"], args)


def quota_of(org):
    return http("POST", "/rest/v1/rpc/organization_ai_quota", None, {"target_organization_id": org}, apikey=SECRET)[1][0]


ISSUE_BODY = {"quote_id": quote_b, "discount": None,
              "items": [{"type": "service", "description": "Item de teste", "category": None, "quantity": None,
                         "unit": None, "total_price_cents": 10000}],
              "commercial_terms": {"payment_terms": None, "estimated_duration_days": None, "validity_days": None}}

# --- limites
st, d = admin("admin_set_limits", B, target_organization_id=B["org"], daily_interpretations=1, daily_extractions=1, reason="tentando")
ok("usuário comum NÃO define limite", st == 403, f"{st} {d}")
st, d = admin("admin_set_limits", A, target_organization_id=B["org"], daily_interpretations=1, daily_extractions=1, reason=" ")
ok("limite sem motivo é recusado (400)", st == 400, f"{st} {d}")
st, d = admin("admin_set_limits", A, target_organization_id=B["org"], daily_interpretations=-3, daily_extractions=None, reason="valor inválido")
ok("limite negativo é recusado (400)", st == 400, f"{st} {d}")
st, d = admin("admin_set_limits", A, target_organization_id="00000000-0000-4000-8000-000000000000",
              daily_interpretations=1, daily_extractions=1, reason="organização que não existe")
ok("limite em organização inexistente dá 404", st == 404, f"{st} {d}")
st, d = admin("admin_set_limits", A, target_organization_id=B["org"], daily_interpretations=1, daily_extractions=1,
              reason="Teste de freio de custo")
ok("admin define limite 1/1 em B", st in (200, 204), f"{st} {d}")
q = quota_of(B["org"])
ok("limite efetivo de B virou 1/1 (sobrescrito)", q["daily_interpretations"] == 1 and q["daily_extractions"] == 1 and q["limits_overridden"], str(q))

# B já tem 1 interpretação e 1 leitura nas últimas 24h (passo 2) -> as duas estouram sem chamar a IA
st, d = http("POST", "/functions/v1/interpret-quote", B["token"], {"quote_id": quote_b})
ok("interpret-quote recusa acima do limite (429 daily_limit)", st == 429 and d.get("code") == "daily_limit", f"{st} {d}")
st, d = extract_image(B["token"])
ok("extract-input recusa acima do limite (429 daily_limit)", st == 429 and d.get("code") == "daily_limit", f"{st} {d}")

st, d = admin("admin_set_limits", A, target_organization_id=B["org"], daily_interpretations=None, daily_extractions=None,
              reason="Volta ao padrão")
q = quota_of(B["org"])
ok("limite null volta ao padrão do sistema (100/60)",
   st in (200, 204) and q["daily_interpretations"] == 100 and q["daily_extractions"] == 60 and not q["limits_overridden"], str(q))
ok("padrão: A (sem limite próprio) também tem 100/60", quota_of(A["org"])["daily_interpretations"] == 100)

# --- suspensão
st, d = admin("admin_suspend_organization", B, target_organization_id=B["org"], reason="me suspendendo")
ok("usuário comum NÃO suspende", st == 403, f"{st} {d}")
st, d = admin("admin_suspend_organization", A, target_organization_id=B["org"], reason="Uso suspeito no teste")
ok("admin suspende B", st in (200, 204), f"{st} {d}")
st, d = admin("admin_suspend_organization", A, target_organization_id=B["org"], reason="de novo")
ok("suspender de novo dá 409", st == 409, f"{st} {d}")
st, d = http("POST", "/functions/v1/interpret-quote", B["token"], {"quote_id": quote_b})
ok("suspensa: interpret-quote recusa (403 organization_suspended)", st == 403 and d.get("code") == "organization_suspended", f"{st} {d}")
st, d = http("POST", "/functions/v1/issue-quote", B["token"], ISSUE_BODY)
ok("suspensa: issue-quote recusa (403 organization_suspended)", st == 403 and d.get("code") == "organization_suspended", f"{st} {d}")
st, d = extract_image(B["token"])
ok("suspensa: extract-input recusa (403 organization_suspended)", st == 403 and d.get("code") == "organization_suspended", f"{st} {d}")
st, d = http("PATCH", f"/rest/v1/organizations?id=eq.{B['org']}", B["token"], {"suspended_at": None})
ok("B NÃO tira a própria suspensão pela API", st in (401, 403), f"{st} {d}")
st, d = http("PATCH", f"/rest/v1/organizations?id=eq.{B['org']}", B["token"], {"trade_name": "Empresa comum editada"})
ok("B continua editando o perfil (só a suspensão é protegida)", st in (200, 204), f"{st} {d}")
st, d = http("GET", f"/rest/v1/quotes?organization_id=eq.{B['org']}&select=id,suspended:organizations(suspended_at)", B["token"])
ok("suspensa: B ainda lê os próprios dados e enxerga que está suspensa",
   st == 200 and len(d) == 1 and d[0]["suspended"]["suspended_at"] is not None, f"{st} {d}")
ok("lista do admin mostra B suspensa", any(r["organization_id"] == B["org"] and r["suspended_at"]
                                            for r in admin("admin_list_organizations", A)[1]))

st, d = admin("admin_reactivate_organization", A, target_organization_id=B["org"], reason="Falso alarme")
ok("admin reativa B", st in (200, 204), f"{st} {d}")
st, d = admin("admin_reactivate_organization", A, target_organization_id=B["org"], reason="de novo")
ok("reativar quem não está suspensa dá 409", st == 409, f"{st} {d}")
st, d = http("POST", "/functions/v1/issue-quote", B["token"], ISSUE_BODY)
ok("reativada: B volta a emitir (200)", st == 200, f"{st} {d}")

# --- destravar interpretação presa
psql(f"insert into ai_interpretations (quote_id, status, created_at) values ('{quote_b}', 'processando', now() - interval '20 minutes')")
psql(f"insert into ai_interpretations (quote_id, status, created_at) values ('{quote_b}', 'processando', now() - interval '2 minutes')")
row_b = next(r for r in admin("admin_list_organizations", A)[1] if r["organization_id"] == B["org"])
ok("lista mostra 1 interpretação presa (só a de >10 min)", row_b["stuck_interpretations"] == 1, str(row_b["stuck_interpretations"]))
st, d = admin("admin_unstick_interpretations", B, target_organization_id=B["org"], reason="destravando")
ok("usuário comum NÃO destrava", st == 403, f"{st} {d}")
st, d = admin("admin_unstick_interpretations", A, target_organization_id=B["org"], reason="Function caiu no meio")
ok("admin destrava 1 interpretação", st == 200 and d == 1, f"{st} {d}")
states = psql(f"select string_agg(status || ':' || coalesce(error, ''), ',' order by created_at) from ai_interpretations "
              f"where quote_id = '{quote_b}' and created_at > now() - interval '1 hour' and status <> 'falhou' or error = 'unstuck_by_admin'")
ok("a antiga virou falha 'unstuck_by_admin'; a recente (2 min) segue em andamento",
   "falhou:unstuck_by_admin" in states and "processando:" in states, states)
st, d = admin("admin_unstick_interpretations", A, target_organization_id=B["org"], reason="de novo")
ok("sem nada preso, destravar dá 409", st == 409, f"{st} {d}")

# --- auditoria
acts = psql(f"select string_agg(action, ',' order by created_at) from admin_actions where organization_id = '{B['org']}'")
ok("toda ação ficou na auditoria, na ordem",
   acts == "suspend,set_limits,set_limits,suspend,reactivate,unstick_interpretation", acts)
prev = psql(f"select details -> 'previous' ->> 'daily_interpretations' from admin_actions where organization_id = '{B['org']}' "
            f"and action = 'set_limits' order by created_at desc limit 1")
ok("auditoria do limite guarda o valor anterior", prev == "1", prev)
ok("ações recusadas (409/400/403) NÃO viraram auditoria",
   psql(f"select count(*) from admin_actions where organization_id = '{B['org']}' and reason in ('de novo', 'tentando', 'me suspendendo')") == "0")

print()
print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)")
sys.exit(1 if ok.failed else 0)
