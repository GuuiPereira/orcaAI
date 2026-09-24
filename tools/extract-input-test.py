"""Teste da Edge Function extract-input (Fase 4A) contra a stack LOCAL.

Uso: python3 tools/extract-input-test.py <pasta-com-media/>
A pasta precisa de media/{fala.mp3,bilhete.png,conversa.png,injecao.png,vazia.png}: um áudio em pt-BR,
imagens com texto (bilhete, print de conversa), uma imagem com uma "instrução" embutida e uma sem texto.
Sobe com: supabase functions serve --env-file <arquivo com OPENAI_API_KEY, OPENAI_MODEL e EXTRACTION_DAILY_LIMIT=5>
(o limite 5 é o que o teste do 429 espera). Gasta centavos de dólar de OpenAI.
"""
import json, subprocess, sys, time, uuid, urllib.request, urllib.error

S = sys.argv[1]
BASE = "http://127.0.0.1:54321"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

def http(method, path, token=None, body=None, headers=None, raw=None):
    h = {"apikey": ANON}
    if token: h["Authorization"] = f"Bearer {token}"
    if headers: h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if body is not None: h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

def multipart(fields, files):
    """fields: [(name, value)], files: [(name, filename, mime, bytes)]"""
    b = uuid.uuid4().hex; out = b""
    for n, v in fields:
        out += f'--{b}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n'.encode()
    for n, fn, mime, data in files:
        out += f'--{b}\r\nContent-Disposition: form-data; name="{n}"; filename="{fn}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + data + b"\r\n"
    out += f"--{b}--\r\n".encode()
    return out, {"Content-Type": f"multipart/form-data; boundary={b}"}

def extract(token, kind, files, extra=None):
    fields = [("kind", kind)] + (extra or [])
    raw, h = multipart(fields, files)
    return http("POST", "/functions/v1/extract-input", token, raw=raw, headers=h)

def psql(sql):
    return subprocess.run(["docker","exec","supabase_db_orcaai","psql","-U","postgres","-d","postgres","-Atc",sql],capture_output=True,text=True).stdout.strip()

def ok(label, cond, detail=""):
    print(("PASSOU  " if cond else "FALHOU  ") + label + (f"  [{detail}]" if detail else ""))
    if not cond: ok.failed += 1
ok.failed = 0

def rd(name): return open(f"{S}/media/{name}", "rb").read()

def make_account(tag, with_org=True):
    email = f"ext-{tag}-{int(time.time())}@orcaai.local"
    st, d = http("POST", "/auth/v1/signup", body={"email": email, "password": "senha-teste-123"})
    token, uid = d["access_token"], d["user"]["id"]
    org = None
    if with_org:
        st, o = http("POST", "/rest/v1/organizations", token, {"owner_user_id": uid, "trade_name": f"Empresa {tag}"}, {"Prefer": "return=representation"})
        org = o[0]["id"]
        http("POST", "/rest/v1/organization_members", token, {"organization_id": org, "user_id": uid, "role": "owner", "status": "active"})
    return dict(token=token, uid=uid, org=org)

A = make_account("A"); NOORG = make_account("semorg", with_org=False)
img = lambda n: (("file", f"{n}.png", "image/png", rd(f"{n}.png")))

# --- autenticação / autorização
raw, h = multipart([("kind", "image")], [img("bilhete")])
st, _ = http("POST", "/functions/v1/extract-input", None, raw=raw, headers=h)
ok("sem login é recusado (401)", st == 401, str(st))
st, d = extract(NOORG["token"], "image", [img("bilhete")])
ok("usuário sem organização é recusado (403)", st == 403, f"{st} {d}")

# --- validação (não deve gastar nem registrar nada)
st, d = extract(A["token"], "video", [img("bilhete")]); ok("kind inválido (400)", st == 400, str(st))
st, d = extract(A["token"], "image", [img("bilhete")] * 4); ok("mais de 3 imagens (400)", st == 400, str(st))
st, d = extract(A["token"], "image", [("file", "x.mp3", "audio/mpeg", rd("fala.mp3"))]); ok("imagem com MIME de áudio (400)", st == 400, str(st))
st, d = extract(A["token"], "image", []); ok("sem arquivo (400)", st == 400, str(st))
st, d = extract(A["token"], "audio", [("file", "a.mp3", "audio/mpeg", rd("fala.mp3"))], [("duration_ms", "200000")]); ok("áudio declarado > 2 min (400)", st == 400 and d.get("code") == "too_long", f"{st} {d}")
st, d = extract(A["token"], "audio", [("file", "a.txt", "text/plain", b"nao e audio")]); ok("áudio com formato não suportado (400)", st == 400, str(st))
ok("validações não gravaram registro nenhum", psql(f"select count(*) from input_extractions where organization_id='{A['org']}'") == "0")

# --- extrações reais (gastam centavos)
t0 = time.time()
st, d = extract(A["token"], "audio", [("file", "fala.mp3", "audio/mpeg", rd("fala.mp3"))], [("duration_ms", "18000")])
ok("ÁUDIO: transcreve (200)", st == 200 and "Maria" in d.get("text", ""), f"{st} {time.time()-t0:.1f}s")
print("        texto:", (d.get("text") or str(d))[:200])
ok("ÁUDIO: valor em algarismos (2.800) para o destaque", "2.800" in d.get("text", ""))
ok("ÁUDIO: units = segundos medidos", d.get("units") in range(15, 22), str(d.get("units")))

st, d = extract(A["token"], "image", [img("bilhete")])
ok("IMAGEM bilhete: lê o valor exato", st == 200 and "R$ 2.800,00" in d.get("text", ""), str(st))
print("        texto:", d.get("text", str(d))[:120].replace("\n", " | "))

st, d = extract(A["token"], "image", [img("conversa"), img("bilhete")])
ok("2 IMAGENS: juntas, na ordem", st == 200 and d["text"].index("1.900") < d["text"].index("2.800"), str(st))
ok("2 IMAGENS: ignora horário/interface do app", "14:32" not in d.get("text", "") and "14:35" not in d.get("text", ""))

st, d = extract(A["token"], "image", [img("injecao")])
ok("INJEÇÃO na imagem: devolve como TEXTO (não obedece)", st == 200 and "3.500,00" in d["text"] and "IGNORE" in d["text"].upper(), str(st))
print("        texto:", d.get("text", "")[:160].replace("\n", " | "))
ok("INJEÇÃO: a resposta NÃO virou o comando da imagem", not d["text"].strip().startswith("PREÇO TOTAL"))

st, d = extract(A["token"], "image", [img("vazia")])
ok("imagem SEM texto: erro claro (422 no_text)", st == 422 and d.get("code") == "no_text", f"{st} {d}")

# --- limite diário (configurado em 5): áudio + 3 imagens + a vazia = 5
st, d = extract(A["token"], "image", [img("bilhete")])
ok("limite diário por organização (429)", st == 429 and d.get("code") == "daily_limit", f"{st} {d}")

# --- registros: só metadados, custo/latência preenchidos, nenhum conteúdo
rows = psql(f"select kind||'|'||status||'|'||coalesce(error,'')||'|'||coalesce(units::text,'')||'|'||round(coalesce(estimated_cost_cents,0),4)||'|'||coalesce(latency_ms::text,'') from input_extractions where organization_id='{A['org']}' order by created_at").split("\n")
print("        registros (tipo|status|erro|unidades|custo¢|latência ms):")
for r in rows: print("         ", r)
ok("5 registros (4 ok + 1 sem texto), o 429 não gasta", len(rows) == 5, str(len(rows)))
audio_row = [r for r in rows if r.startswith("audio")][0].split("|")
ok("custo do áudio bate com 18s x US$0,0045/min (~0,135¢)", abs(float(audio_row[4]) - 0.135) < 0.05, audio_row[4])
cols = psql("select string_agg(column_name, ',') from information_schema.columns where table_name='input_extractions'")
ok("tabela NÃO tem coluna para conteúdo (texto/mídia)", not any(w in cols for w in ("text", "content", "media", "file", "transcript")), cols)
ok("usuário comum NÃO lê o registro (sem policy)", http("GET", "/rest/v1/input_extractions?select=id", A["token"])[1] in ([], None) or http("GET", "/rest/v1/input_extractions?select=id", A["token"])[0] in (401, 403))

# --- conta agendada pra exclusão é bloqueada
B = make_account("B")
http("POST", "/functions/v1/delete-account", B["token"], {"action": "request"})
st, d = extract(B["token"], "image", [img("bilhete")])
ok("conta com exclusão agendada é bloqueada (403)", st == 403, f"{st} {d}")

print(); print("RESULTADO:", "TUDO OK" if ok.failed == 0 else f"{ok.failed} FALHA(S)"); sys.exit(1 if ok.failed else 0)
