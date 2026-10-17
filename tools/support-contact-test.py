"""Teste do contato de suporte configurável pelo painel admin, contra a stack LOCAL.

Uso: python3 tools/support-contact-test.py   (não precisa de functions serve)
Restaura o contato que existia antes do teste.
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
    st, d = http("POST", "/auth/v1/signup", body={"email": f"sup-{tag}-{int(time.time() * 1000)}@orcaai.local", "password": "senha-teste-123"})
    return dict(token=d["access_token"], uid=d["user"]["id"])


before = psql("select coalesce(whatsapp, '') || '|' || coalesce(email, '') from support_settings").split("|")
A = account("admin"); B = account("comum")
psql(f"insert into platform_admins (user_id) values ('{A['uid']}')")


def setc(acc, whatsapp, email, reason):
    return http("POST", "/rest/v1/rpc/admin_set_support_contact", acc["token"], {"whatsapp": whatsapp, "email": email, "reason": reason})


def getc(acc):
    st, d = http("POST", "/rest/v1/rpc/get_support_contact", acc["token"], {})
    return st, (d[0] if st == 200 and d else d)


st, d = setc(A, "5511999998888", "Suporte@OrcaAI.com.br", "Contato do teste fechado")
ok("admin define WhatsApp e e-mail", st in (200, 204), f"{st} {d}")
st, d = getc(B)
ok("usuário comum lê o contato (e-mail normalizado em minúsculas)",
   st == 200 and d == {"whatsapp": "5511999998888", "email": "suporte@orcaai.com.br"}, f"{st} {d}")
st, d = http("POST", "/rest/v1/rpc/get_support_contact", None, {})
ok("sem login NÃO lê o contato", st in (401, 403), str(st))
st, d = setc(B, "5511000000000", "golpe@x.com", "trocando o suporte")
ok("usuário comum NÃO altera o contato", st == 403, f"{st} {d}")
st, d = http("GET", "/rest/v1/support_settings?select=*", B["token"])
ok("ninguém lê a tabela direto pela API", st in (401, 403), str(st))
st, d = setc(A, "(11) 9999-8888", None, "formato errado")
ok("WhatsApp com máscara/sem DDI é recusado pelo banco (400)", st == 400, f"{st} {d}")
st, d = setc(A, "5511999998888", "sem-arroba", "e-mail inválido")
ok("e-mail inválido é recusado (400)", st == 400, f"{st} {d}")
st, d = setc(A, "5511999998888", None, " ")
ok("sem motivo é recusado (400)", st == 400, f"{st} {d}")
st, d = setc(A, "", "suporte@orcaai.com.br", "Só e-mail por enquanto")
ok("vazio remove o canal (só e-mail fica)", st in (200, 204) and getc(B)[1] == {"whatsapp": None, "email": "suporte@orcaai.com.br"}, str(getc(B)[1]))
acts = psql("select count(*) from admin_actions where action = 'set_support_contact' and reason in ('Contato do teste fechado', 'Só e-mail por enquanto')")
ok("as duas mudanças aceitas foram auditadas (recusadas não)", acts == "2", acts)
prev = psql("select details -> 'previous' ->> 'whatsapp' from admin_actions where action = 'set_support_contact' order by created_at desc limit 1")
ok("auditoria guarda o valor anterior", prev == "5511999998888", prev)

setc(A, before[0], before[1], "Restaura o ambiente local")
print()
print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)")
sys.exit(1 if ok.failed else 0)
