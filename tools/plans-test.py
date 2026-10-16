"""Teste dos planos (Fase 3, .tasks/fase-3-planos.md) contra a stack LOCAL.

Uso: python3 tools/plans-test.py
Sobe com: supabase functions serve --env-file supabase/functions/interpret-quote/.env.local
Não gasta IA: as recusas por plano acontecem antes de qualquer chamada à OpenAI,
e as emissões não usam IA.
"""
import base64, json, subprocess, sys, time, urllib.request, urllib.error, uuid

ROOT = "/home/guilherme/Projetos/OrçaAI"
BASE = "http://127.0.0.1:54321"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def http(method, path, token=None, body=None):
    headers = {"apikey": ANON, "Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t


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


def psql(sql):
    return subprocess.run(["docker", "exec", "supabase_db_orcaai", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
                          capture_output=True, text=True).stdout.strip()


def ok(label, cond, detail=""):
    print(("PASSOU  " if cond else "FALHOU  ") + label + (f"  [{detail}]" if detail else ""))
    if not cond: ok.failed += 1
ok.failed = 0


def make_account(tag):
    email = f"plan-{tag}-{int(time.time() * 1000)}@orcaai.local"
    st, d = http("POST", "/auth/v1/signup", body={"email": email, "password": "senha-teste-123"})
    token, uid = d["access_token"], d["user"]["id"]
    http("POST", "/rest/v1/organizations", token, {"owner_user_id": uid, "trade_name": f"Empresa {tag}"})
    org = http("GET", f"/rest/v1/organizations?owner_user_id=eq.{uid}&select=id", token)[1][0]["id"]
    http("POST", "/rest/v1/organization_members", token, {"organization_id": org, "user_id": uid, "role": "owner", "status": "active"})
    return dict(token=token, uid=uid, org=org)


def rpc(fn, acc, **args):
    return http("POST", f"/rest/v1/rpc/{fn}", acc["token"], args)


def ent(acc):
    st, d = rpc("my_entitlements", acc)
    return d[0] if st == 200 and d else None


def new_quote(acc):
    http("POST", "/rest/v1/quotes", acc["token"], {"organization_id": acc["org"], "source_text": "x", "status": "rascunho"})
    return http("GET", f"/rest/v1/quotes?organization_id=eq.{acc['org']}&number=is.null&select=id&order=created_at.desc&limit=1",
                acc["token"])[1][0]["id"]


def issue(acc, quote_id, price=10000):
    return http("POST", "/functions/v1/issue-quote", acc["token"], {
        "quote_id": quote_id, "discount": None,
        "items": [{"type": "service", "description": "Item", "category": None, "quantity": None, "unit": None, "total_price_cents": price}],
        "commercial_terms": {"payment_terms": None, "estimated_duration_days": None, "validity_days": None}})


def future(days):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + days * 86400))


A = make_account("admin")
psql(f"insert into platform_admins (user_id) values ('{A['uid']}')")
original_signup = psql("select signup_plan_code from plan_settings")

print("== cadastro e leitura dos direitos")
B = make_account("b")
ok("organização nova entra no plano de cadastro (Profissional durante o teste)",
   psql(f"select plan_code || ':' || source from organization_subscriptions where organization_id='{B['org']}'") == "profissional:signup")
e = ent(B)
ok("my_entitlements: Profissional, ilimitado, sem marca, com logo e áudio/imagem",
   e and e["plan_code"] == "profissional" and e["monthly_issued_quotes"] is None and not e["pdf_branding"]
   and e["company_logo_in_pdf"] and e["audio_image_input"], str(e))
for table in ("plans", "organization_subscriptions", "plan_settings"):
    st, d = http("GET", f"/rest/v1/{table}?select=*", B["token"])
    ok(f"usuário NÃO lê {table} pela API", st in (401, 403), f"{st}")
st, d = rpc("organization_entitlements", B, target_organization_id=A["org"])
ok("usuário NÃO consulta os direitos de outra organização", st in (401, 403, 404), f"{st} {d}")
st, d = http("POST", "/rest/v1/organization_subscriptions", B["token"], {"organization_id": B["org"], "plan_code": "profissional"})
ok("usuário NÃO se dá um plano pela API", st in (401, 403), f"{st}")
st, d = rpc("admin_set_plan", B, target_organization_id=B["org"], plan_code="profissional", expires_at=None, reason="quero")
ok("usuário comum NÃO chama admin_set_plan", st == 403, f"{st} {d}")

print("== Gratuito")
st, d = rpc("admin_set_plan", A, target_organization_id=B["org"], plan_code="gratuito", expires_at=None, reason="Teste do gratuito")
e = ent(B)
ok("admin passa B para o Gratuito", st in (200, 204) and e["plan_code"] == "gratuito", f"{st} {d}")
ok("Gratuito: 3 por mês, com marca, sem logo, sem áudio/imagem",
   e["monthly_issued_quotes"] == 3 and e["pdf_branding"] and not e["company_logo_in_pdf"] and not e["audio_image_input"], str(e))
st, d = extract_image(B["token"])
ok("Gratuito: extract-input recusa (403 plan_feature) sem chamar a IA", st == 403 and d.get("code") == "plan_feature", f"{st} {d}")

first = new_quote(B)
results = [issue(B, first)[0]] + [issue(B, new_quote(B))[0] for _ in range(2)]
ok("Gratuito: 3 primeiras emissões do mês passam", results == [200, 200, 200], str(results))
ok("contagem do mês = 3", ent(B)["issued_this_month"] == 3, str(ent(B)["issued_this_month"]))
st, d = issue(B, new_quote(B))
ok("Gratuito: 4ª emissão do mês recusada (403 plan_limit)", st == 403 and d.get("code") == "plan_limit", f"{st} {d}")
st, d = issue(B, first, price=12345)
ok("reemitir um orçamento já emitido NÃO conta nem é barrado", st == 200 and d["quote"]["current_version"] == 2, f"{st}")
ok("reemissão não mexeu na contagem do mês", ent(B)["issued_this_month"] == 3)

print("== Profissional com validade e vencimento")
st, d = rpc("admin_set_plan", A, target_organization_id=B["org"], plan_code="profissional", expires_at=future(-1), reason="validade no passado")
ok("validade no passado é recusada (400)", st == 400, f"{st} {d}")
st, d = rpc("admin_set_plan", A, target_organization_id=B["org"], plan_code="ouro", expires_at=None, reason="plano que não existe")
ok("plano inexistente é recusado (400)", st == 400, f"{st} {d}")
st, d = rpc("admin_set_plan", A, target_organization_id=B["org"], plan_code="profissional", expires_at=future(30), reason="Pagou o mês via Pix")
e = ent(B)
ok("admin ativa Profissional por 30 dias", st in (200, 204) and e["plan_code"] == "profissional" and e["expires_at"], f"{st} {e}")
st, d = issue(B, new_quote(B))
ok("Profissional: emite além do limite do Gratuito", st == 200, f"{st} {d}")
psql(f"update organization_subscriptions set expires_at = now() - interval '1 minute' where organization_id='{B['org']}'")
e = ent(B)
ok("venceu: volta sozinho ao Gratuito e diz qual plano venceu",
   e["plan_code"] == "gratuito" and e["expired_plan_code"] == "profissional" and e["expired_at"], str(e))
st, d = issue(B, new_quote(B))
ok("vencido: emissão nova recusada de novo (403 plan_limit)", st == 403 and d.get("code") == "plan_limit", f"{st} {d}")

print("== mês civil")
C = make_account("c")
rpc("admin_set_plan", A, target_organization_id=C["org"], plan_code="gratuito", expires_at=None, reason="Teste do mês")
q = new_quote(C)
for _ in range(3):
    psql(f"insert into quote_events (quote_id, event_type, created_at) values ('{q}', 'emitido', "
         f"(date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') - interval '1 day')")
ok("emissões do mês passado não contam no mês atual", ent(C)["issued_this_month"] == 0, str(ent(C)["issued_this_month"]))

print("== plano de cadastro")
st, d = rpc("admin_get_signup_plan", A)
ok("admin lê o plano de cadastro", st == 200 and d[0]["signup_plan_code"] == original_signup, f"{st} {d}")
st, d = rpc("admin_get_signup_plan", B)
ok("usuário comum NÃO lê o plano de cadastro", st == 403, f"{st}")
st, d = rpc("admin_set_signup_plan", A, plan_code="gratuito", expires_at=None, reason="Fim do teste fechado")
D = make_account("d")
ok("com cadastro no Gratuito, organização nova fica sem assinatura (Gratuito)",
   st in (200, 204) and psql(f"select count(*) from organization_subscriptions where organization_id='{D['org']}'") == "0"
   and ent(D)["plan_code"] == "gratuito", f"{st} {d}")
st, d = rpc("admin_set_signup_plan", A, plan_code="profissional", expires_at=future(14), reason="Novo período de teste")
E = make_account("e")
e = ent(E)
ok("cadastro em Profissional com validade: org nova ganha a validade", st in (200, 204) and e["plan_code"] == "profissional" and e["expires_at"], str(e))
rpc("admin_set_signup_plan", A, plan_code=original_signup, expires_at=None, reason="Volta ao estado do ambiente local")

print("== painel e auditoria")
row = next(r for r in rpc("admin_list_organizations", A)[1] if r["organization_id"] == B["org"])
ok("lista do painel traz plano, venceu e contagem do mês",
   row["plan_code"] == "gratuito" and row["expired_plan_code"] == "profissional" and row["issued_this_month"] == 4
   and row["monthly_issued_quotes"] == 3, str({k: row[k] for k in ("plan_code", "expired_plan_code", "issued_this_month", "monthly_issued_quotes")}))
acts = psql(f"select string_agg(action, ',' order by created_at) from admin_actions where organization_id='{B['org']}'")
ok("ações de plano na auditoria (recusadas não entram)", acts == "set_plan,set_plan", acts)
prev = psql(f"select details -> 'previous' ->> 'plan' from admin_actions where organization_id='{B['org']}' order by created_at desc limit 1")
ok("auditoria guarda o plano anterior", prev == "gratuito", prev)
ok("mudanças do plano de cadastro auditadas (sem organização)",
   psql("select count(*) from admin_actions where action='set_signup_plan' and reason in ('Fim do teste fechado','Novo período de teste')") == "2")

print()
print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)")
sys.exit(1 if ok.failed else 0)
