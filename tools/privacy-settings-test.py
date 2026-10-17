"""Teste dos dados da política de privacidade (configuráveis no painel admin),
contra a stack LOCAL. Uso: python3 tools/privacy-settings-test.py
(não precisa de functions serve). Restaura os valores que existiam antes.
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
    return subprocess.run(["docker", "exec", "supabase_db_orcaai", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
                          capture_output=True, text=True).stdout.strip()


def ok(label, cond, detail=""):
    print(("PASSOU  " if cond else "FALHOU  ") + label + (f"  [{detail}]" if detail else ""))
    if not cond: ok.failed += 1
ok.failed = 0


def account(tag):
    st, d = http("POST", "/auth/v1/signup", body={"email": f"priv-{tag}-{int(time.time() * 1000)}@orcaai.local", "password": "senha-teste-123"})
    return dict(token=d["access_token"], uid=d["user"]["id"])


def setp(acc, name, document, email, days, reason):
    return http("POST", "/rest/v1/rpc/admin_set_privacy_settings", acc["token"], {
        "controller_name": name, "controller_document": document, "privacy_email": email, "response_days": days, "reason": reason})


def getp(token=None):
    st, d = http("POST", "/rest/v1/rpc/get_privacy_settings", token, {})
    return st, (d[0] if st == 200 and d else d)


before = getp()[1]
A = account("admin"); B = account("comum")
psql(f"insert into platform_admins (user_id) values ('{A['uid']}')")

st, d = getp()
ok("SEM login lê os dados da política (abre na tela de entrada)", st == 200 and isinstance(d, dict), f"{st} {d}")
st, d = setp(A, "OrçaAI Tecnologia", "12.345.678/0001-90", "Privacidade@OrcaAI.com.br", 15, "Dados do teste fechado")
ok("admin preenche os dados", st in (200, 204), f"{st} {d}")
st, d = getp(B["token"])
ok("usuário lê os dados (e-mail normalizado)", d == {"controller_name": "OrçaAI Tecnologia", "controller_document": "12.345.678/0001-90",
                                                     "privacy_email": "privacidade@orcaai.com.br", "response_days": 15}, str(d))
st, d = setp(B, "Golpista", None, "x@y.com", 15, "trocando")
ok("usuário comum NÃO altera", st == 403, f"{st} {d}")
st, d = http("GET", "/rest/v1/privacy_settings?select=*", B["token"])
ok("ninguém lê a tabela direto pela API", st in (401, 403), str(st))
for label, args in [
    ("prazo acima de 15 dias", ("Nome", None, "a@b.com", 16)),
    ("prazo zero", ("Nome", None, "a@b.com", 0)),
    ("e-mail inválido", ("Nome", None, "sem-arroba", 15)),
    ("documento com letras", ("Nome", "abc.def.ghi-jk", "a@b.com", 15)),
    ("nome de 1 letra", ("N", None, "a@b.com", 15)),
]:
    st, d = setp(A, *args, "validação")
    ok(f"recusa {label} (400)", st == 400, f"{st} {d.get('message') if isinstance(d, dict) else d}")
st, d = setp(A, "Fulano de Tal", "", "fulano@orcaai.com.br", 10, "Sem CPF publicado")
ok("documento vazio = não publicado (opcional)", st in (200, 204) and getp()[1]["controller_document"] is None, str(getp()[1]))
st, d = setp(A, "Fulano", None, None, None, " ")
ok("sem motivo é recusado (400)", st == 400, f"{st}")
acts = psql("select count(*) from admin_actions where action = 'set_privacy_settings' and reason in ('Dados do teste fechado', 'Sem CPF publicado')")
ok("as duas mudanças aceitas foram auditadas (recusadas não)", acts == "2", acts)
prev = psql("select details -> 'previous' ->> 'controller_name' from admin_actions where action = 'set_privacy_settings' order by created_at desc limit 1")
ok("auditoria guarda o valor anterior", prev == "OrçaAI Tecnologia", prev)

setp(A, before["controller_name"], before["controller_document"], before["privacy_email"], before["response_days"], "Restaura o ambiente local")
print()
print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)")
sys.exit(1 if ok.failed else 0)
