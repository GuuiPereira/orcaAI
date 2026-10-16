"""Teste da captura e das views da Fase 5 (Grafana) contra a stack LOCAL:
user_id e latency_ms em ai_interpretations, ai_quality_metrics na emissão, o
evento "compartilhado" em quote_events, e as views metrics_*.

Uso: python3 tools/grafana-capture-test.py
Sobe com: supabase functions serve --env-file supabase/functions/interpret-quote/.env.local
(gasta centavos de dólar de OpenAI, uma interpretação).
"""
import json, subprocess, sys, time, urllib.request, urllib.error

BASE = "http://127.0.0.1:54321"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

def http(method, path, token=None, body=None):
    headers = {"apikey": ANON, "Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

def psql(sql):
    return subprocess.run(["docker","exec","supabase_db_orcaai","psql","-U","postgres","-d","postgres","-Atc",sql],capture_output=True,text=True).stdout.strip()

def ok(label, cond, detail=""):
    print(("PASSOU  " if cond else "FALHOU  ") + label + (f"  [{detail}]" if detail else ""))
    if not cond: ok.failed += 1
ok.failed = 0

def make_account(tag):
    email = f"graf-{tag}-{int(time.time()*1000)}@orcaai.local"
    st, d = http("POST", "/auth/v1/signup", body={"email": email, "password": "senha-teste-123"})
    token, uid = d["access_token"], d["user"]["id"]
    st, o = http("POST", "/rest/v1/organizations", token, {"owner_user_id": uid, "trade_name": f"Empresa {tag}"})
    st2, o2 = http("GET", f"/rest/v1/organizations?owner_user_id=eq.{uid}&select=id", token)
    org = o2[0]["id"]
    http("POST", "/rest/v1/organization_members", token, {"organization_id": org, "user_id": uid, "role": "owner", "status": "active"})
    return dict(token=token, uid=uid, org=org)

A = make_account("A")
B = make_account("B")

st, q = http("POST", "/rest/v1/quotes", A["token"], {"organization_id": A["org"], "source_text": "Pintura de 2 quartos, 400 reais. Comprar 10 litros de tinta.", "status": "rascunho"})
st2, q2 = http("GET", f"/rest/v1/quotes?organization_id=eq.{A['org']}&select=id", A["token"])
quote_id = q2[0]["id"]

# --- interpret-quote: user_id e latency_ms
st, d = http("POST", "/functions/v1/interpret-quote", A["token"], {"quote_id": quote_id})
ok("interpret-quote OK (200)", st == 200, f"{st} {d}")
row = psql(f"select user_id, latency_ms, status from ai_interpretations where quote_id='{quote_id}' order by created_at desc limit 1")
print("        ai_interpretations:", row)
uid_col, latency_col, status_col = row.split("|")
ok("user_id gravado bate com quem chamou", uid_col == A["uid"], uid_col)
ok("latency_ms é um número > 0", latency_col.isdigit() and int(latency_col) > 0, latency_col)

ai_items = d["result"]["items"]
print("        itens da IA:", json.dumps(ai_items, ensure_ascii=False))

# --- issue-quote: edita um item (preço) e adiciona um novo -> compara com ai_quality_metrics
edited_items = [dict(ai_items[0], total_price_cents=50000), dict(ai_items[1]), {"type": "other", "description": "Taxa", "category": None, "quantity": None, "unit": None, "total_price_cents": 1000}]
issue_body = {"quote_id": quote_id, "items": edited_items, "discount": None, "commercial_terms": {"payment_terms": None, "estimated_duration_days": None, "validity_days": None}}
st, d = http("POST", "/functions/v1/issue-quote", A["token"], issue_body)
ok("issue-quote OK (200)", st == 200, f"{st} {d}")

qm = psql(f"select items_from_ai, items_emitted, items_added, items_removed, items_unchanged, items_changed, fields_changed from ai_quality_metrics where quote_id='{quote_id}'")
print("        ai_quality_metrics:", qm)
parts = qm.split("|")
ok("items_from_ai = 2, items_emitted = 3", parts[0] == "2" and parts[1] == "3", qm)
ok("items_added = 1 (o item novo 'Taxa')", parts[2] == "1", qm)
ok("items_removed = 0", parts[3] == "0", qm)
ok("items_unchanged = 1 (o item de material não mudou)", parts[4] == "1", qm)
ok("items_changed = 1 (o preço do serviço mudou)", parts[5] == "1", qm)
ok("fields_changed = 1", parts[6] == "1", qm)

# --- evento "compartilhado"
st, d = http("POST", "/rest/v1/quote_events", A["token"], {"quote_id": quote_id, "event_type": "compartilhado"})
ok("membro registra evento 'compartilhado' direto (201)", st == 201, f"{st} {d}")
st, d = http("POST", "/rest/v1/quote_events", A["token"], {"quote_id": quote_id, "event_type": "bagunça"})
ok("evento fora da allowlist continua recusado", st in (401, 403), f"{st} {d}")
st, d = http("POST", "/rest/v1/quote_events", B["token"], {"quote_id": quote_id, "event_type": "compartilhado"})
ok("usuário de outra organização NÃO registra evento neste orçamento", st in (401, 403), f"{st} {d}")

# --- nenhuma leitura pública das tabelas novas de métrica
st, d = http("GET", "/rest/v1/ai_quality_metrics?select=id", A["token"])
ok("ai_quality_metrics sem policy pra usuário comum", d in ([], None) or st in (401, 403), f"{st} {d}")

cols = psql("select string_agg(column_name, ',') from information_schema.columns where table_name='ai_quality_metrics'")
ok("ai_quality_metrics não tem coluna de conteúdo", not any(w in cols for w in ("text","description","category")) , cols)

# --- views do passo 2 (metrics_*): existem, têm dados coerentes e NINGUÉM
# comum as lê pela API (só service_role, mesma regra das views do Task 8)
for view in [
    "metrics_ai_latency_daily",
    "metrics_usage_daily",
    "metrics_cost_monthly",
    "metrics_time_to_share_daily",
    "metrics_ai_quality_by_prompt",
]:
    st, d = http("GET", f"/rest/v1/{view}?select=*&limit=1", A["token"])
    ok(f"view {view} não é legível por usuário comum", st in (401, 403), f"{st} {d}")

latency = psql(f"select p50_ms from metrics_ai_latency_daily where day = current_date")
ok("metrics_ai_latency_daily tem latência medida hoje", latency != "" and float(latency) > 0, latency)

usage_row = psql(f"select interpretations, quotes_issued from metrics_usage_daily where organization_id='{A['org']}'")
ok("metrics_usage_daily reflete a interpretação e a emissão de A", usage_row == "1|1", usage_row)

quality_row = psql("select pct_fully_accepted from metrics_ai_quality_by_prompt where prompt_version='1.5'")
ok("metrics_ai_quality_by_prompt tem a versão de prompt usada", quality_row != "", quality_row)

share_step = psql("select count(*) from metrics_funnel_daily where step='compartilhado' and day=current_date")
ok("funil (metrics_funnel_daily) inclui o passo 'compartilhado'", int(share_step) >= 1, share_step)

print()
print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)")
sys.exit(1 if ok.failed else 0)
