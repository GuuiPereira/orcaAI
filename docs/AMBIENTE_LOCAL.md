# Ambiente local - Docker, Supabase CLI e Expo/EAS

Guia de referência para rodar o OrçaAI (backend e app) na máquina local. O
Supabase CLI e o EAS CLI estão instalados como dependência de desenvolvimento
do monorepo (não são globais), por isso todo comando é chamado com
`pnpm exec ...` a partir da raiz do repositório (Supabase) ou de
`apps/mobile` (Expo/EAS).

## Atalho: subir tudo de uma vez

Pra não precisar abrir três terminais toda vez que for testar, tem um script
na raiz que sobe a stack do Supabase, a `interpret-quote` e o Expo web juntos:

```bash
pnpm run dev
```

Isso roda `supabase start` e, quando terminar, sobe `functions serve` e
`expo web` ao mesmo tempo (via [concurrently](https://github.com/open-cli-tools/concurrently)),
com a saída de cada um prefixada (`[functions]` / `[expo]`) e colorida. Ctrl+C
para os dois processos de uma vez, mas **não** para os containers do
Supabase - pra isso:

```bash
pnpm run dev:stop
```

Pré-requisito: `supabase/functions/interpret-quote/.env.local` já configurado
com uma `OPENAI_API_KEY` válida (ver seção "Testando a `interpret-quote`
localmente" abaixo). Se preferir controlar cada processo à parte (ex.: pra
reiniciar só a function depois de mexer nela), use os comandos individuais
das seções seguintes.

## Docker

O Supabase local sobe um conjunto de containers (Postgres, Auth, Storage,
Studio, etc.). O Docker precisa estar instalado e rodando para isso funcionar.

| Comando | O que faz |
| --- | --- |
| `docker ps` | Lista os containers em execução. Útil para conferir se a stack do Supabase subiu. |
| `docker ps -a` | Lista todos os containers, incluindo os parados. |
| `docker images` | Lista as imagens já baixadas localmente. |
| `docker logs <nome-do-container>` | Mostra os logs de um container específico (ex.: `docker logs supabase_db_orcaai`). |
| `docker stop <nome-do-container>` | Para um container específico. |
| `docker system df` | Mostra quanto espaço em disco Docker está usando (imagens, containers, volumes). |
| `docker system prune` | Remove containers parados, imagens e caches não usados. Libera espaço; não afeta containers em execução. |

Normalmente você não precisa chamar `docker` diretamente: o Supabase CLI
gerencia os containers da stack para você (veja abaixo). Os comandos de Docker
são mais úteis para depurar quando algo não sobe corretamente.

### Se aparecer "permission denied" ao rodar `docker`

Isso acontece quando seu usuário foi adicionado ao grupo `docker`, mas a
sessão do terminal atual ainda não "enxerga" essa mudança (grupos são
carregados no login). Soluções, da mais simples à mais definitiva:

- Abrir um terminal novo.
- Rodar `newgrp docker` no terminal atual.
- Fazer logout/login (ou reiniciar a máquina).

## Supabase CLI

Todos os comandos abaixo devem ser rodados na raiz do repositório
(`/home/guilherme/Projetos/OrçaAI`).

### Ciclo de vida do ambiente local

| Comando | O que faz |
| --- | --- |
| `pnpm exec supabase start` | Sobe toda a stack local via Docker (Postgres, Auth, Storage, Studio, Realtime, Edge Functions) e aplica as migrações em `supabase/migrations/`. Na primeira vez baixa as imagens, pode demorar alguns minutos. |
| `pnpm exec supabase stop` | Para todos os containers da stack local. Os dados do Postgres continuam salvos em um volume Docker até você rodar com `--no-backup` ou remover o volume manualmente. |
| `pnpm exec supabase status` | Mostra se a stack está rodando e imprime as URLs/chaves locais (API, Studio, DB, chaves anon/service_role). |

### Banco de dados e migrações

| Comando | O que faz |
| --- | --- |
| `pnpm exec supabase db reset` | Recria o banco local do zero: apaga os dados, reaplica **todas** as migrações em ordem e roda `supabase/seed.sql`. Use sempre que quiser voltar a um estado limpo ou testar migrações desde o início. |
| `pnpm exec supabase migration new <nome>` | Cria um novo arquivo de migração vazio em `supabase/migrations/`, com timestamp no nome (ex.: `20260801120000_nome.sql`). É o jeito correto de adicionar mudanças de schema. |
| `pnpm exec supabase db diff -f <nome>` | Compara o schema atual do banco local com as migrações já aplicadas e gera uma nova migração com a diferença. Útil se você mexeu no schema direto pelo Studio e quer "capturar" isso como migração. |
| `pnpm exec supabase db push` | Aplica as migrações locais pendentes num projeto Supabase remoto (precisa rodar `supabase link` antes). Usado para levar mudanças para produção/staging. |
| `pnpm exec supabase db pull` | Traz o schema de um projeto remoto e gera uma migração local a partir dele. Útil ao conectar num projeto que já existe. |

### Projeto remoto (Supabase Cloud)

| Comando | O que faz |
| --- | --- |
| `pnpm exec supabase login` | Autentica o CLI com sua conta Supabase (abre o navegador). |
| `pnpm exec supabase link --project-ref <ref>` | Associa este repositório a um projeto Supabase na nuvem (o `<ref>` aparece na URL do projeto no dashboard). Necessário antes de usar `db push`/`db pull` contra produção. |

### Edge Functions

| Comando | O que faz |
| --- | --- |
| `pnpm exec supabase functions new <nome>` | Cria o esqueleto de uma nova Edge Function em `supabase/functions/<nome>/`. |
| `pnpm exec supabase functions serve` | Roda as Edge Functions localmente (usa a stack já iniciada com `supabase start`), com hot reload. |
| `pnpm exec supabase functions deploy <nome>` | Publica uma função no projeto remoto vinculado. |

### Login com Google (Task 1 da Fase 2)

O provider Google do Supabase Auth local é configurado em
`supabase/config.toml` (seção `[auth.external.google]`). O `client_id` não é
segredo e fica direto nesse arquivo; o `client_secret` fica em `.env.local`
na **raiz do repositório** (não em `apps/mobile/` nem em
`supabase/functions/...`), na variável `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.

O `pnpm exec supabase start` carrega `.env`/`.env.local` da raiz sozinho
(confirmado no binário do CLI - não precisa de nenhum flag ou script extra
pra isso funcionar), então basta esse arquivo existir com a variável
preenchida antes de subir a stack.

Redirect URI cadastrado no Google Cloud Console (tipo "Aplicativo da Web"):
`http://127.0.0.1:54321/auth/v1/callback`. **Tem que ser esse, não dá pra
trocar pelo IP da rede local** - o Google recusa IP privado (`192.168.x.x`
etc.) como redirect URI de OAuth com o erro `Erro 400: invalid_request -
device_id and device_name are required for private IP` (só aceita
`localhost`/`127.0.0.1` ou um domínio público de verdade). Isso ficou
confirmado testando: `[auth.external.google].redirect_uri` em
`config.toml` fica **vazio** (usa o padrão do GoTrue, que já é
`127.0.0.1`), mesmo que a chamada inicial pra `/authorize` tenha vindo de
outro host.

**Consequência prática: o login com Google só é testável de ponta a ponta
no navegador do próprio computador por enquanto.** No celular físico, dá
pra abrir a tela de login e clicar em "Entrar com Google", mas o
redirecionamento de volta do Google esbarra nesse bloqueio - só vai
funcionar de verdade no celular quando existir um projeto Supabase
hospedado (domínio público real, `https://<ref>.supabase.co/auth/v1/callback`
- é a Task 9, distribuição pros testadores) ou com um túnel (ngrok/
Cloudflare Tunnel) expondo a stack local por HTTPS. Até lá, testar a
lógica do app pós-login no celular via a técnica de sessão injetada
(seção abaixo) ou pelo navegador do computador.

#### Popup vs. redirecionamento de página inteira (web)

`apps/mobile/src/lib/auth.ts` (nativo) usa
`WebBrowser.openAuthSessionAsync` num popup/Custom Tab e captura o retorno
direto, sem precisar de rota nenhuma. `apps/mobile/src/lib/auth.web.ts`
(split de plataforma) faz diferente **de propósito**: a tela de login do
Google define um `Cross-Origin-Opener-Policy` que quebra a comunicação
`postMessage`/`window.opener` entre popup e janela principal (proteção do
próprio Google contra sequestro de aba - não é bug nosso, mas quebra o
padrão de popup que o `expo-web-browser` usa no navegador). Por isso no
web a gente deixa o `supabase-js` fazer o redirecionamento de página
inteira de verdade (comportamento padrão de `signInWithOAuth` no
navegador). Se um dia migrar esse fluxo pra popup de novo, tem que lidar
com isso.

**O GoTrue devolve os tokens direto no hash da URL**
(`#access_token=...&refresh_token=...`, não `?code=...`) pra provedores
OAuth externos como o Google - é assim há tempos pra esse tipo de
provider, independente do `flowType` do cliente. `detectSessionInUrl` no
`apps/mobile/src/lib/supabase.ts` só é `true` no web (`Platform.OS ===
'web'`) especificamente por causa disso - deixa o próprio supabase-js
detectar e processar esse hash sozinho. `apps/mobile/src/app/auth-callback.tsx`
não faz nenhum parsing de token manual - só existe como uma rota de
verdade (sem "Unmatched Route") pra segurar a tela ("Concluindo login…")
enquanto isso acontece, e mostrar erro do provedor se houver.

Como `additional_redirect_urls` em `config.toml` precisa bater exatamente
com a URL de redirect (`http://<host>:<porta>/auth-callback`), e
`expo start --web` pode cair em portas diferentes (8081 ocupada -> tenta
8082 etc.), as portas mais comuns já estão liberadas ali. Se aparecer
"conexão recusada" com a porta 3000 depois de escolher a conta no Google,
é sinal de porta nova - adicione mais uma entrada.

`EXPO_PUBLIC_SUPABASE_URL` (`apps/mobile/.env.local`), por outro lado,
**continua valendo a pena apontar pro IP da rede local**
(`http://<IP-da-rede>:54321`, `hostname -I` pra descobrir) quando for
testar no celular - isso não esbarra em nenhuma política do Google, é só
tráfego direto entre o celular e a API REST/functions, e sem isso
*nenhuma* chamada à API funciona a partir do celular (não só o login). O
IP muda se a rede mudar (DHCP) - se as chamadas do celular pararem de
funcionar, confira se o IP em `.env.local` ainda bate com `hostname -I`.

Depois de editar `config.toml` ou `.env.local`, é preciso reiniciar a stack
(`pnpm exec supabase stop` + `pnpm exec supabase start`, ou `pnpm dev` de
novo) e o Metro (`expo start`) pra aplicar - nenhuma das duas mudanças é
hot reload (`.env.local` do app é lido na hora do build do bundle, não em
runtime).

#### Testando o app logado (sem passar pela tela de consentimento do Google)

Não dá pra automatizar a tela de login de verdade do Google (2FA, captcha,
etc.), mas dá pra testar o resto do app (as telas atrás do login) injetando
uma sessão real direto no `localStorage`, sem precisar clicar em nada:

1. Pegar um token via password grant (usuário do seed, que já tem
   organização - ou crie outro com `/auth/v1/signup` pra testar o estado
   "sem organização"):

   ```bash
   ANON_KEY="<PUBLISHABLE_KEY/ANON_KEY de supabase status>"
   curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
     -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
     -d '{"email":"test@orcaai.local","password":"orcaai-local-test"}' \
     > /tmp/session.json
   ```

2. A chave do `localStorage` que o supabase-js usa por padrão é
   `sb-${hostname.split('.')[0]}-auth-token`, onde `hostname` vem de
   `EXPO_PUBLIC_SUPABASE_URL` (`apps/mobile/.env.local`) - **depende do IP
   configurado ali** (ver seção "Login com Google" acima), então muda se
   você trocar entre `127.0.0.1` e o IP da rede local. Ex.: pra
   `http://192.168.15.5:54321` isso dá `sb-192-auth-token` (só o primeiro
   pedaço do IP separado por ponto - resultado meio estranho, mas é assim
   que a lib calcula). Confira o valor atual de `EXPO_PUBLIC_SUPABASE_URL`
   antes de montar a chave.
3. Com Playwright (ou no devtools do navegador), setar
   `localStorage.setItem('sb-192-auth-token', <conteúdo do session.json>)`
   (troque `192` conforme o passo 2) **antes** da página carregar
   (`page.addInitScript` no Playwright), e navegar pra
   `http://localhost:8090/`. O app inicializa já autenticado.

Isso testa toda a lógica de gate (`apps/mobile/src/hooks/use-auth-gate.ts`)
e as telas atrás do login sem depender do fluxo real do Google - que só dá
pra validar manualmente, num dispositivo/navegador de verdade, com uma
conta Google real.

### Onboarding / perfil do prestador (Task 2 da Fase 2)

Usuário sem organização (estado `no-organization` do gate) cai em
`/onboarding` - o formulário cria a organização e a `organization_members`
do dono. Pra testar sem passar pelo Google: crie um usuário novo via
`/auth/v1/signup` (em vez de `/auth/v1/token?grant_type=password`, que
exige um usuário já existente) e injete a sessão dele como na seção
acima - ele cai direto no onboarding por não ter organização nenhuma.

**Pegadinha de RLS que já mordeu uma vez:** criar a organização e depois
tentar ler ela de volta (o `.select('id')` do Supabase JS depois de um
`.insert()`, usado pra pegar o id gerado) esbarrava numa 403 -
"row-level security policy" - porque a policy de `select` em
`organizations` só permitia ver organizações onde o usuário já é membro
(`organization_members`), e essa membership só é criada no passo
seguinte. A mensagem de erro não deixa isso óbvio (parece que o insert
falhou, mas na verdade é a leitura de volta que falha). Corrigido na
migração: a policy de `select` também permite `owner_user_id =
auth.uid()`, cobrindo esse instante entre criar a organização e criar a
membership.

Depois de criar a organização, o gate não reage sozinho (ele só reage a
mudança de sessão, e criar organização não muda a sessão) - por isso
`onboarding.tsx` chama `notifyOrganizationChanged()`
(`apps/mobile/src/hooks/use-auth-gate.ts`) explicitamente após o
`createOrganization()` ter sucesso, forçando o gate a checar de novo.

### Numeração e emissão (Task 4 da Fase 2)

`issue-quote` (`supabase/functions/issue-quote`) não precisa de segredo
nenhum (só fala com o Postgres) - basta a stack local rodando e a function
sendo servida. **Descoberta útil:** `supabase functions serve <nome>` serve
**todas** as functions da pasta `supabase/functions/`, não só a que foi
passada por nome - `pnpm run dev` (que só chama `functions serve
interpret-quote` explicitamente) já deixa `issue-quote` acessível também,
sem precisar adicionar nada ao script.

No editor (`/quote/[quoteId]`), o card "Emissão" (abaixo de "Resumo") chama
essa function com os itens/desconto/condições que estão em memória no
momento - até a emissão, nada disso é gravado (`quote_items`/`quotes.discount`/
`quotes.commercial_terms` continuam vazios). A function recalcula os totais
no backend (nunca confia no que o app mandou - regra de negócio 6), numera
só na 1ª emissão (`next_quote_number`, função transacional no Postgres -
reemissão reaproveita o número, regra 4), grava um snapshot completo e
imutável em `quote_versions` (com dados de organização/cliente copiados
daquele momento, não só o id) e só a partir daí grava os itens de verdade em
`quote_items`. Reemitir com o **mesmo** conteúdo (mesmos itens/desconto/
condições) não cria outra versão - devolve a última já existente
(idempotência, RNF-004); mudar qualquer coisa e emitir de novo cria uma
versão nova com o mesmo número.

Testando via curl (usuário/orçamento do seed):

```bash
ANON_KEY="<PUBLISHABLE_KEY/ANON_KEY de supabase status>"

TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"test@orcaai.local","password":"orcaai-local-test"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s http://127.0.0.1:54321/functions/v1/issue-quote \
  -X POST -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quote_id":"44444444-4444-4444-8444-444444444444",
    "items":[{"type":"service","description":"Pintura sala","category":null,"quantity":null,"unit":null,"total_price_cents":150000}],
    "discount": null,
    "commercial_terms": {"payment_terms":"50% entrada","estimated_duration_days":5,"validity_days":10}
  }'
```

Testado via Playwright (sessão injetada, como na seção acima) no orçamento
do seed: adicionar um item e clicar "Emitir orçamento" gera o Nº
`2026-0001` e versão 1; recarregar a página traz o item de volta (vem de
`quote_items`, não mais da última interpretação da IA - é o que diferencia
um orçamento já emitido de um rascunho novo); clicar em "Emitir nova
versão" de novo sem mudar nada mantém a versão 1 (idempotente); mudar o
valor do item e emitir de novo cria a versão 2 mantendo o mesmo número.
Conferido direto no Postgres (`docker exec supabase_db_orcaai psql -U
postgres -d postgres`) que `quotes`, `quote_items` e `quote_versions`
batem com o que a tela mostra. Sem erros de console em nenhum passo.

**Pegadinha ao automatizar o formulário do editor:** os campos de item
(Descrição, Valor etc.) são `TextInput` do React Native Paper - o texto que
parece um placeholder é na verdade a prop `label` (renderizada num `<div>`
solto, sem `for`/`aria-labelledby` ligando ao `<input>`), então nem
`getByPlaceholder` nem `getByLabel` do Playwright acham o campo. Funciona
selecionar por posição (`page.locator('input, textarea').nth(n)`, na ordem
em que os campos aparecem na tela) ou adicionar `testID`/`aria-label`
explícito no componente se isso incomodar em testes futuros.

### Storage privado - logos e PDFs (Task 6 da Fase 2)

Os buckets `logos` e `quote-pdfs` já vêm criados automaticamente por
`pnpm exec supabase start`/`db reset` (declarados em `supabase/config.toml`,
`[storage.buckets.*]`) - não precisa criar nada na mão. As policies de
isolamento por organização ficam na migração
`20260920163601_storage_policies.sql`.

**Testando as policies direto pela API do Storage** (não dá pra simular
`auth.uid()` via `psql`/`set_config` como se faz com functions Postgres
normais - o Storage roda como API própria, então o jeito é autenticar de
verdade e chamar o endpoint REST):

```bash
ANON_KEY="<PUBLISHABLE_KEY/ANON_KEY de supabase status>"
TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"test@orcaai.local","password":"orcaai-local-test"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

ORG="22222222-2222-4222-8222-222222222222"
curl -X POST "http://127.0.0.1:54321/storage/v1/object/logos/${ORG}/logo.png" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/png" --data-binary @caminho/para/imagem.png
```

Trocar `-X POST` por `-H "x-upsert: true"` (mesmo POST) pra sobrescrever o
logo; um usuário sem organização (`/auth/v1/signup` + `grant_type=password`,
como já documentado acima) recebe 400 tentando ler ou escrever num caminho
de organização que não é a dele.

**Logo (RF-005):** tela de Perfil (`/profile`), card "Logo" - botão
"Escolher logo"/"Trocar logo" abre o seletor de imagens
(`expo-image-picker`, dependência nova com módulo nativo - só funciona de
verdade num app já instalado depois de rodar `eas build` de novo; no
navegador funciona direto, sem rebuild nenhum). Testado via Playwright:
`page.waitForEvent('filechooser')` + `fileChooser.setFiles(caminho)`
simula a escolha de arquivo de verdade (o seletor do `expo-image-picker` no
web é só um `<input type="file">` escondido, clicado programaticamente -
Playwright lida com isso nativamente, diferente da tela de login do
Google). Upload + `organizations.logo_path` gravado + exibição via signed
URL confirmados; sem erros de console.

**PDF emitido:** depois de "Emitir orçamento" ter sucesso, o app tenta
gerar e subir o PDF "completo" da versão pro Storage automaticamente
(`lib/quote-pdf-storage.ts`) e depois chama a function `attach-quote-pdf`
pra gravar `quote_versions.pdf_path` (essa tabela só aceita escrita via
service role, mesmo padrão do `issue-quote` - por isso são dois passos
via function, não um só). **No navegador isso é só um no-op**
(`quote-pdf-storage.web.ts`): `expo-print` no web não gera um arquivo/
base64 de verdade, só abre o diálogo de impressão do sistema (mesma
limitação de `pdf-share.web.ts`) - a emissão em si continua funcionando
normal, só fica sem PDF anexado (`pdf_path` continua `null`). Testável no
navegador: emitir não deve gerar nenhum erro/aviso de "PDF não foi salvo".
**Não testável no navegador:** o upload de verdade do PDF - isso só
acontece com um development build nativo instalado num dispositivo/
emulador (precisa de um novo `eas build` por causa do `expo-image-picker`
- ver seção "EAS CLI" abaixo -, já que essa dependência tem módulo
nativo). Testando a function isolada, sem depender do app:

```bash
QUOTE="44444444-4444-4444-8444-444444444444"
VERSION=1
# sobe um pdf de teste no caminho que attach-quote-pdf espera
curl -X POST "http://127.0.0.1:54321/storage/v1/object/quote-pdfs/${ORG}/${QUOTE}/${VERSION}.pdf" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/pdf" --data-binary @caminho/para/arquivo.pdf

curl http://127.0.0.1:54321/functions/v1/attach-quote-pdf \
  -X POST -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"quote_id\":\"$QUOTE\",\"version\":$VERSION}"
```

### Monitoramento com Sentry e métricas (Task 8 da Fase 2)

**Ligar o Sentry (opcional - sem DSN tudo fica inerte, nada é enviado):**
1. No sentry.io, crie um projeto **React Native** (app) e outro **Deno**
   (functions), ou um só pros dois - o DSN aparece em *Settings > Client
   Keys*. O plano gratuito basta pro teste fechado.
2. App: `EXPO_PUBLIC_SENTRY_DSN=<dsn>` em `apps/mobile/.env.local` (e reinicie
   o Expo com `--clear` - variáveis `EXPO_PUBLIC_*` entram no bundle).
3. Functions: `SENTRY_DSN=<dsn>` em `supabase/functions/interpret-quote/
   .env.local` - é esse o arquivo que `pnpm run dev` passa pra **todas** as
   functions (`--env-file`). Reinicie o `pnpm run dev`.
4. Sentry nativo (crash do celular) **só existe num build novo** (`eas
   build`) - o SDK tem módulo nativo. No navegador funciona direto.
5. Builds do EAS: pra subir source maps, `SENTRY_AUTH_TOKEN` como secret do
   EAS e `organization`/`project` nas opções do plugin
   `@sentry/react-native/expo` em `app.json` (hoje sem opções - só o SDK).

**Privacidade (RNF-008):** tudo que sai passa por `sanitizeEvent`/
`sanitizeBreadcrumb` (`packages/shared/src/monitoring/sanitize.ts`, com
testes): só o ID técnico do usuário, método+caminho da requisição, URLs sem
query string (as do Supabase carregam termos de busca de cliente), sem
breadcrumbs de `console`, sem corpo de requisição, e e-mail/telefone/CPF/CNPJ
removidos das mensagens de erro. Sem replay de sessão, sem tracing, sem PII
automática. **Cuidado ao mexer:** o Sentry também anexa linhas do código-fonte
ao redor do erro - nunca coloque dado de cliente literal no código.

**Testar sem conta (Sentry falso):** um servidor HTTP que grava o que recebe
serve de DSN (`http://chave@127.0.0.1:9911/1` no app; nas functions do
runtime local o host é o IP da máquina, não `127.0.0.1`, porque roda em
container). Foi assim que validei: no navegador, buscar um cliente e estourar
um erro com e-mail na mensagem → 1 evento, sem o nome buscado, sem a query
nas URLs; nas functions, um 500 tratado e uma exceção com dados sensíveis →
2 eventos, 0 vazamentos. `deno` não está instalado na máquina; pra rodar o
helper `supabase/functions/_shared/sentry.ts` fora do runtime do Supabase,
`npm i deno` numa pasta temporária (o Deno bloqueia versões de pacote com
menos de 24h - por isso o `@sentry/deno` está fixado em `~10.74.0`, não na
11.0.0 recém-lançada).

**Métricas (SQL, só o operador):** views `metrics_ai_daily` (custo em
centavos de **dólar**, falhas, schema inválido, por versão de prompt/
modelo), `metrics_funnel_daily` (criado → interpretado → emitido → enviado/
aprovado...) e `metrics_pdf_coverage`. Só `service_role` lê (agregam todas
as organizações e ignoram RLS):

```bash
docker exec supabase_db_orcaai psql -U postgres -d postgres -c "select * from metrics_ai_daily;"
```

**Alerta de custo:** function `check-ai-cost` (chave secret, não JWT de
usuário): compara o custo do dia com `AI_DAILY_COST_LIMIT_CENTS` (centavos de
dólar) e manda um evento `alert=ai-cost` pro Sentry se passou - crie lá uma
regra de alerta por e-mail pra essa tag. **Ainda não está agendada:** no
projeto hospedado (task 9) agende com o cron do Supabase (`pg_cron` +
`pg_net`, ou o painel de Cron Jobs) chamando `POST /functions/v1/check-ai-cost`
com o header `apikey: <secret key>`. Testando local:

```bash
SECRET=$(pnpm exec supabase status -o json | python3 -c "import sys,json;print(json.load(sys.stdin)['SECRET_KEY'])")
curl http://127.0.0.1:54321/functions/v1/check-ai-cost -H "apikey: $SECRET"
```

**pnpm:** instalar o `@sentry/react-native` pediu aprovar o build script do
`@sentry/cli` (binário que sobe source maps) - está `true` em
`pnpm-workspace.yaml`. Se o pnpm pedir de novo, o contorno do store
(`--store-dir`) da seção "Unexpected store location" vale também pro
`pnpm install`.

### Projeto hospedado (Supabase Cloud) e build de teste (Task 9 da Fase 2)

Projeto `OrcaAI`, ref `rqdrwcrbcdrdxzfwtiwv`, região `sa-east-1`. A senha do
banco fica só em `SUPABASE_DB_PASSWORD` no `.env.local` da **raiz** (ignorado
pelo git); pra usar nos comandos: `set -a; . ./.env.local; set +a`.

| O que | Comando |
| --- | --- |
| Ligar o repo ao projeto (sem senha) | `pnpm exec supabase login` e `pnpm exec supabase link --project-ref <ref>` |
| Ver o que subiria (não aplica) | `pnpm exec supabase db push --dry-run` |
| Aplicar migrações | `pnpm exec supabase db push` (o **seed não vai** - o banco hospedado começa vazio) |
| Publicar as functions | `pnpm exec supabase functions deploy --project-ref <ref>` |
| Secrets das functions | `pnpm exec supabase secrets set NOME=valor --project-ref <ref>` (ou `--env-file`) |
| SQL no banco hospedado | `pnpm exec supabase db query --linked "select ..."` (ou `--file`) |
| Chaves da API | `pnpm exec supabase projects api-keys --project-ref <ref> --reveal` |

**Pegadinhas que apareceram:**
- `projects api-keys` **mascara** a chave secret (`sb_secret_dj······`) - sem
  `--reveal` ela parece válida mas dá "Invalid API key". A `check-ai-cost`
  (`auth: 'secret'`) só aceita a chave **nova** `sb_secret_...`, não o
  `service_role` JWT legado.
- **Não use `supabase config push`** pra criar os buckets: ele empurra o
  `config.toml` inteiro e sobrescreveria o que foi configurado no painel
  (login com Google, Site URL, Redirect URLs). Os buckets `logos` e
  `quote-pdfs` foram criados pela API do Storage (`POST /storage/v1/bucket`,
  privados, com os limites do `config.toml`). `supabase seed buckets` não
  mostra opção pra escolher o alvo, então não arrisquei.
- **Cron do `check-ai-cost`:** `pg_cron` + `pg_net`, de hora em hora
  (`check-ai-cost-hourly`), com a chave secret guardada no **Vault**
  (`check_ai_cost_key`), nunca em texto no agendamento. Não é migração
  (o agendamento carrega o ref do projeto e o segredo, e o banco local nem
  tem o Vault com essa chave) - foi criado uma vez por
  `db query --linked`. Pra conferir: `select * from cron.job;` e
  `select status_code, content from net._http_response order by id desc limit 1;`.
  Limite: `AI_DAILY_COST_LIMIT_CENTS=100` (US$ 1,00/dia).
- **`.env.local` do app tem prioridade sobre variável de shell:** com o DSN
  real do Sentry lá, passar `EXPO_PUBLIC_SENTRY_DSN=...` no comando do
  Expo **não** troca o destino (nem `EXPO_NO_DOTENV=1` resolveu) - os testes
  mandaram eventos pro projeto real. Pra testar o filtro sem enviar nada,
  intercepte no navegador: `page.route(/sentry\.io/, r => { guarda o
  postData; r.fulfill({status:200, body:'{}'}) })` no Playwright.
- **Versão do `@sentry/react-native` tem que ser a do SDK:** `pnpm add`
  pega a mais nova (8.x), mas o Expo SDK 57 espera `~7.11.0` - `npx
  expo-doctor` acusa como "Major version mismatch". O `expo install` é o
  jeito certo, mas falha com o problema do store do pnpm; nesse caso
  `pnpm --store-dir <store antigo> add "@sentry/react-native@~7.11.0"`.

**EAS (build de teste):** perfil `preview` em `apps/mobile/eas.json`
(`distribution: internal`, APK, `SENTRY_DISABLE_AUTO_UPLOAD=true` até existir
`SENTRY_AUTH_TOKEN`). Variáveis do ambiente `preview` no EAS
(`eas env:set preview --name ... --value ... --visibility plaintext`):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (a chave
**publicável** do projeto hospedado) e `EXPO_PUBLIC_SENTRY_DSN` - todas
públicas por natureza (vão dentro do app). Gerar o APK:

```bash
cd apps/mobile && pnpm exec eas build --platform android --profile preview
```

Na **primeira** vez o EAS pergunta se gera a chave de assinatura Android
(keystore) - responda que sim; isso só funciona interativo, por isso o
comando é seu, não de um script. `expo-doctor` ainda aponta 3 itens que já
existiam antes: o `resolver.unstable_enableSymlinks` do Metro (necessário
no monorepo pnpm), `eas-cli` como dependência do projeto e versões patch
do Expo um pouco atrás - nenhum bloqueia o build.

### Login com Google no aparelho - bugs achados no 1º APK (Task 9)

O fluxo nativo de login só tinha sido testado no navegador. No primeiro APK
o app **fechava** ao voltar do Google. Causas encontradas no código (não na
configuração do Supabase/Google):

1. **`supabase-js` v2 usa o fluxo implícito por padrão**, não PKCE - mesmo
   o comentário antigo dizendo o contrário. `signInWithOAuth` sem
   `flowType: 'pkce'` gera a URL **sem** `code_challenge` (confirmado
   chamando o cliente), então o redirect volta com tokens no hash e nunca
   com o `?code=` que `lib/auth.ts` espera. Agora `supabase.ts` usa PKCE no
   nativo e mantém o implícito no web (é o que o `auth-callback.tsx` +
   `detectSessionInUrl` já tratam).
2. **`window` existe no React Native, `window.location` não.** A tela
   `auth-callback.tsx` (o Expo Router também navega pra ela quando o Android
   entrega o deep link `mobile://auth-callback`, apesar do comentário antigo)
   lia `window.location.search` na renderização -> `TypeError` -> app de
   release fecha. Agora só lê a localização no web.
3. Falha de login agora vai pro Sentry (`area: google-login`).
4. Bônus, achado na mesma leva: `expo-image-picker` **não precisa de
   permissão** pra abrir a galeria (a documentação diz isso), mas o código
   pedia e lançava erro se negada - bloqueava o upload do logo. Removido.

**Como investigar um crash do APK sem cabo/`adb`:** o Sentry (projeto
`orcaai-app`) recebe o crash - procure o issue no horário da tentativa.
Esses bugs **não dá pra reproduzir no navegador**; corrigir exige um build
novo. Quando o JS mudar sem mudança nativa, dá pra evitar novo build
configurando o EAS Update (ainda não configurado).

### Build local do APK e atualizações sem build (Task 9)

A fila do EAS gratuito pode passar de 1h. O `eas build --local` compila na
própria máquina, com o mesmo perfil, as mesmas variáveis e a **mesma chave de
assinatura** do EAS (então o APK local atualiza um instalado pela nuvem).

**Instalação única, sem `sudo`** (tudo na pasta pessoal; pra desfazer é só
apagar `~/.local/jdk-17`, `~/Android` e `~/.gradle`):

1. **JDK 17 (Temurin):** baixar
   `https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse`
   e extrair em `~/.local/jdk-17` (`tar -xzf ... --strip-components=1`).
2. **Ferramentas de linha de comando do Android:** baixar
   `https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip`,
   extrair em `~/Android/Sdk/cmdline-tools` e renomear a pasta
   `cmdline-tools` de dentro para `latest` (o caminho tem que ser
   `~/Android/Sdk/cmdline-tools/latest`).
3. **Variáveis, só do terminal atual** (repetir a cada terminal novo):
   `JAVA_HOME=$HOME/.local/jdk-17`, `ANDROID_HOME=$HOME/Android/Sdk` e o
   `PATH` com `$JAVA_HOME/bin`, `$ANDROID_HOME/cmdline-tools/latest/bin` e
   `$ANDROID_HOME/platform-tools`.
4. **Licenças (aceite dos termos do Google) e componentes que o RN 0.86
   pede:** `yes | sdkmanager --licenses` e depois
   `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"`.
5. **Memória do Gradle** - sem isto o 1º build falha com "Metaspace".
   Em `~/.gradle/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=2g
kotlin.daemon.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=2g
```

**Gerar o APK** (no terminal com as variáveis do passo 3):

```bash
cd apps/mobile && pnpm exec eas build --platform android --profile preview --local
```

O 1º build leva ~20-30 min (baixa e compila tudo); os seguintes são bem
mais rápidos (cache do Gradle). O arquivo sai em `apps/mobile/build-*.apk`
(`*.apk` está no `.gitignore`). Sem link/QR do EAS: o APK vai por
cabo/Drive/WhatsApp e o Android pede pra liberar "instalar apps
desconhecidos".

**Pegadinhas:**

- **`OutOfMemoryError: Metaspace`** em `kspReleaseKotlin` /
  `lintVitalAnalyzeRelease`: o limite padrão do Gradle é baixo pra tantos
  módulos nativos - é o passo 5, depois encerrar o daemon antigo
  (`pkill -f GradleDaemon`) e rodar de novo.
- **Commite antes de buildar** (`eas build --local` empacota pelo git): a
  configuração do EAS Update estava sem commit quando o 1º build local
  começou; deu certo (o pacote leva os arquivos do disco), mas não dependa
  disso.
- Ruído no fim de um build interrompido (`package.json does not exist ...
  ON_BUILD_COMPLETE_HOOK`) é só consequência do `Ctrl+C`, não é um erro a
  mais.
- Dá pra **inspecionar o APK** sem instalar: extrair o
  `AndroidManifest.xml` e rodar `strings -e l` nele mostra a URL do update,
  a versão de runtime e o canal; `assets/index.android.bundle` é o JS.

**EAS Update (correções de JS sem novo build):** `expo-updates` está no
app; `runtimeVersion` pela política `appVersion` (hoje `1.0.0` - só recebe
update quem tem o mesmo `version` do `app.json`) e canais `preview`/
`development` no `eas.json`. Publicar:

```bash
cd apps/mobile && pnpm exec eas update --channel preview --environment preview --message "descrição"
```

`--environment preview` é obrigatório: é ele que embute no pacote as
variáveis `EXPO_PUBLIC_*` (Supabase, Sentry); sem ele o update sairia sem
elas. No celular, feche o app por completo e abra de novo (às vezes 2x)
pra o update entrar. Mudança **nativa** (biblioteca nova, permissão,
plugin no `app.json`) continua pedindo APK novo - e se mudar o `version`
do `app.json`, os APKs antigos deixam de receber updates.

### Exclusão de conta (Task 7 da Fase 2)

Fluxo com **prazo de 7 dias** (decisão do usuário em 2026-09-24, cobre a
"recuperação de conta" que o gate de lançamento exige): o usuário pede a
exclusão no Perfil ("Excluir minha conta", confirma digitando o nome
comercial), a conta fica **agendada** por 7 dias - o app mostra só a tela
"Sua conta será excluída" (com "Cancelar exclusão" e "Sair") e as functions
`interpret-quote`/`issue-quote` recusam com 403 - e a rotina
`purge-deleted-accounts` apaga tudo quando o prazo vence.

| Peça | O que faz |
| --- | --- |
| `account_deletion_requests` (migração `20260924174324`) | Estado do pedido (`user_id`, `requested_at`, `scheduled_for`). O usuário só **lê** o próprio (RLS); quem escreve é sempre uma function (service role). |
| `delete-account` (`auth: 'user'`) | `{action: 'request'\|'cancel'}` sobre a **própria** conta (o id vem do JWT). Pedir de novo mantém o prazo original (idempotente). |
| `purge-deleted-accounts` (`auth: 'secret'`, `verify_jwt = false`) | Para cada pedido vencido: apaga os arquivos do Storage das organizações do usuário (`logos`, `quote-pdfs` - **sem FK, ficariam órfãos**), depois a organização (a cascata leva clientes, orçamentos, itens, versões, eventos, interpretações e contador de numeração), depois o usuário do Auth. Uma conta que falha não impede as outras. |

**Por que a ordem é essa:** apagar o usuário do Auth era bloqueado por
`organizations.owner_user_id` (`on delete restrict`) e por
`quote_versions.created_by`/`quote_events.actor_user_id` (sem ação). A
migração troca esses dois últimos por `on delete set null` (o registro fica e
só perde a autoria - também anonimiza); a organização é apagada antes do
usuário. Testado que apagar a organização leva clientes e orçamentos sem
esbarrar no `restrict` de `quotes.customer_id`.

**O que NÃO some com a exclusão** (informar na política de privacidade):
eventos do Sentry que já carregam o id do usuário expiram pela retenção do
próprio Sentry; backups do Supabase podem reter dados apagados até rotacionar.

**Testar** (`python3 tools/account-deletion-test.py`, precisa da stack local e de `pnpm exec supabase functions serve` rodando): cria as
contas A e B com organização, cliente, orçamento e arquivos nos dois buckets;
A pede exclusão (7 dias, idempotente, RLS: B não vê nem apaga o pedido de A,
usuário comum não insere pedido direto), A fica bloqueada de IA/emissão e B
segue normal, A cancela e volta a operar, `purge` recusa sem chave/com JWT de
usuário, não apaga antes do prazo, e depois do prazo apaga A **por completo**
(Auth, organização, cascata, perfil, arquivos) deixando B **intacta**. 29
verificações, todas passando.

**Armadilha achada no teste - `supabase link` fixa as versões dos serviços
locais nas do projeto hospedado.** Depois do `link`, o Storage local passou
a ser o `v1.77.5` (o hospedado), mas o container em execução continuava o
`v1.66.4` de antes: qualquer upload dava `500 DatabaseError 42P10`. A
correção é recriar a stack (`pnpm exec supabase stop` + `pnpm exec supabase
start` - os dados do volume ficam); vale sempre depois de um `link`, e deixa
o ambiente local igual ao de produção.

**No projeto hospedado (feito em 2026-09-24):** migração aplicada com `db
push`, as functions publicadas (`delete-account`, `purge-deleted-accounts` e
as alteradas `interpret-quote`/`issue-quote`) e a rotina agendada **1x/dia às
03:00 UTC** (`purge-deleted-accounts-daily`, pg_cron + pg_net, chave secret no
Vault `check_ai_cost_key` - o mesmo padrão do `check-ai-cost`). Conferido de
fora sem criar pedido nenhum: a rotina chamada pelo caminho do cron responde
`{"deleted":0,"failed":0}`; sem credencial dá 401; `delete-account` sem login
dá 401; a tabela de pedidos lida com a chave pública volta vazia. **Não teste
a exclusão com a sua conta real** - use uma conta Google de teste.

### Entrada por áudio e por imagem (Fase 4A)

Na tela "Novo orçamento" há três jeitos de chegar ao texto: **digitar** (o
padrão, igual a antes), **Falar** (grava e transcreve) e **Imagem** (foto/print
com o texto do orçamento; no aparelho há também **Foto**, da câmera). Áudio e
imagem só produzem **texto**: ele cai no mesmo campo, aparece um card
"confira antes de continuar" (miniaturas da imagem e **valores em destaque** -
inclusive por extenso, "dois mil e oitocentos reais") e o botão **Continuar
fica travado até tocar em "Conferi o texto"** (RF-027: preço mal ouvido/lido
não pode passar batido). Uma nova leitura **acrescenta** ao texto existente.

| Peça | O que faz |
| --- | --- |
| `extract-input` (`auth: 'user'`) | `multipart`: `kind=audio` (+ `file`, `duration_ms`) ou `kind=image` (+ até 3 `file`). Áudio vai pro `gpt-transcribe` (pt, com dica pra escrever valores em algarismos); imagem vai pro modelo com visão (`OPENAI_MODEL`) que **só transcreve**. **Nada é guardado** - a mídia passa pela function e é descartada. Responde `{text, kind, units, truncated}`. |
| `input_extractions` | Só metadados por chamada (tipo, segundos/nº de imagens, bytes, modelo, custo estimado, latência, status, código de erro). **Sem coluna de conteúdo**, sem policy pra usuário. Alimenta a Fase 5. |
| Limites | Áudio ≤ 2 min / 8 MB, ≤ 3 imagens de ≤ 4 MB (o app reduz cada foto pra ~1600 px em JPEG antes de enviar), texto ≤ 4000 caracteres, **60 leituras/dia por organização** (`EXTRACTION_DAILY_LIMIT`). |
| Erros (`code`) | `too_long` 400, `daily_limit` 429, `no_text` 422 (áudio sem fala / imagem sem texto legível) - o app mostra mensagem acionável; o resto vai pro Sentry (`audio-record`, `audio-extract`, `image-extract`) sem conteúdo. |

**Privacidade:** o que **nós** guardamos é só a linha de métricas. A OpenAI
recebe a mídia (voz e prints de conversa trazem dados de terceiros): as
chamadas vão com `store: false` (também a `interpret-quote`) - **citar a
retenção da OpenAI na política de privacidade**.

**Testar a function (local, gasta centavos de OpenAI):**

```bash
# 1) stack local no ar + a function com o env (chave OpenAI, limite 5 pro teste do 429):
printf 'OPENAI_API_KEY=...\nOPENAI_MODEL=gpt-5.6-luna\nEXTRACTION_DAILY_LIMIT=5\n' > /tmp/extract.env   # sem SENTRY_DSN
pnpm exec supabase functions serve --env-file /tmp/extract.env
# 2) numa pasta com media/{fala.mp3,bilhete.png,conversa.png,injecao.png,vazia.png}:
python3 tools/extract-input-test.py <pasta>
```

Cobre 401/403/400, limite diário, áudio real, imagens (na ordem, ignorando
horário/interface de app), **instrução embutida na imagem só é transcrita**,
imagem em branco → 422, custo do áudio, ausência de coluna de conteúdo, RLS e
conta com exclusão agendada bloqueada.

**Testar a tela no navegador** (Chromium com microfone falso): `--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=fala.wav`
(WAV PCM - a gravação vira `webm`, que a function aceita). Sem o arquivo o
microfone falso gera um bipe → a function responde `no_text`. Imagens: o
seletor de arquivos aceita várias (`setFiles`). **Na web o `Alert.alert` do
React Native não faz nada**, então os avisos de erro só se veem no aparelho;
o botão **Foto** só existe no nativo.

**O que só dá pra testar no aparelho:** permissão de microfone e de câmera
(negar e conferir a mensagem), gravar com o app em segundo plano, formato
`m4a` gravado pelo `expo-audio`, câmera de verdade, e a latência real
(RNF-002).

**Módulos nativos novos** (`expo-audio`, `expo-image-manipulator`, câmera do
`expo-image-picker`; permissões no `app.json`): exigem **APK novo**, e o
`version` do `app.json` foi para **1.1.0** - o `runtimeVersion` segue a
versão, então APKs 1.0.0 antigos **não** recebem o JavaScript novo por
`eas update` (que quebraria por falta do módulo nativo). Só publique `eas
update` para o 1.1.0 depois de instalar o APK 1.1.0.

**Armadilha - `pnpm typecheck`/`pnpm exec` recusando rodar** ("Command failed
... pnpm install") depois de um `expo install`: o pnpm quer reinstalar por
causa do store-dir diferente. Rode uma vez `CI=true pnpm --store-dir
/home/guilherme/snap/code/252/.local/share/pnpm/store/v11 install` e, se ainda
reclamar, chame direto `apps/mobile/node_modules/.bin/tsc --noEmit` e
`CI=true apps/mobile/node_modules/.bin/expo lint`. (`expo install` também
acrescenta `minimumReleaseAgeExclude` no `pnpm-workspace.yaml` - é esperado.)

### Prévia com os dados do perfil e logo no PDF (Task 2/6 da Fase 2)

Botão "Ver prévia do orçamento" no último passo do onboarding e no Perfil
(`/profile`): abre um orçamento de exemplo (cliente e itens fictícios, aviso
"EXEMPLO") com os dados do prestador. No Perfil a prévia usa o que está no
formulário agora, mesmo sem salvar, e o logo atual.

O logo entra no PDF como imagem embutida (data URI) - o app baixa pela URL
assinada e converte, então o `expo-print` não depende de rede. Testar no
navegador: subir um logo em `/profile` e abrir a prévia; o iframe da prévia
(`page.locator('iframe').first().getAttribute('srcdoc')` no Playwright) deve
conter `<img class="logo" src="data:image/...`. Se o download do logo
falhar, o PDF sai só sem a imagem.

**Dica de teste:** se o Expo web não estiver rodando, `pnpm --filter
@orcaai/mobile exec expo start --web --port 8081` sobe só ele (o `pnpm run
dev` sobe tudo junto).

### Histórico, busca e estados comerciais (Task 5 da Fase 2)

Aba "Orçamentos" (`/quotes`) - lista com busca (número, texto original ou
nome do cliente) e filtros de estado/período. Não precisa de nada especial
pra rodar local, só a stack de sempre.

`quote_events` passou a aceitar `insert` direto do membro (antes só o
service role gravava, igual `quote_versions`) - mas só pros tipos de evento
que o usuário pode mesmo disparar (`criado`, `enviado`, `aprovado`,
`recusado`, `expirado`); `emitido`/`reemitido` continuam só via
`issue-quote`. Testando a restrição direto no Postgres (mesma técnica do
`next_quote_number` - `set role` + `set_config` simulando `auth.uid()`,
porque isso é RLS de tabela normal, não a API do Storage):

```bash
docker exec supabase_db_orcaai psql -U postgres -d postgres -c "
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into quote_events (quote_id, event_type, actor_user_id)
  values ('44444444-4444-4444-8444-444444444444', 'enviado', '11111111-1111-4111-8111-111111111111');
-- funciona; trocar 'enviado' por 'emitido' na linha acima deve falhar com
-- 'new row violates row-level security policy'.
"
```

### Testando a `interpret-quote` localmente

Essa function precisa de duas coisas além da stack local rodando: segredos de
IA e um usuário/orçamento de teste (já vêm prontos pelo `supabase/seed.sql`).

1. Copiar o template de segredos e preencher com uma chave real da OpenAI:

   ```bash
   cp supabase/functions/interpret-quote/.env.example supabase/functions/interpret-quote/.env.local
   ```

   Preencher `OPENAI_API_KEY` e `OPENAI_MODEL` (sem valor padrão de
   propósito - ver `docs/ARCHITECTURE.md §3`). `OPENAI_INPUT_COST_CENTS_PER_1M`
   / `OPENAI_OUTPUT_COST_CENTS_PER_1M` são opcionais, só afetam o
   `estimated_cost_cents` salvo.

2. Subir a function com esses segredos:

   ```bash
   pnpm exec supabase functions serve interpret-quote --env-file supabase/functions/interpret-quote/.env.local
   ```

3. Pegar um token do usuário de teste do seed (`test@orcaai.local` /
   `orcaai-local-test`) e chamar a function. O `quote_id` de exemplo já vem
   populado com a mensagem de exemplo do PRD:

   ```bash
   ANON_KEY="<PUBLISHABLE_KEY ou ANON_KEY da saída de supabase status>"

   TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
     -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
     -d '{"email":"test@orcaai.local","password":"orcaai-local-test"}' \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

   curl -s http://127.0.0.1:54321/functions/v1/interpret-quote \
     -X POST -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"quote_id":"44444444-4444-4444-8444-444444444444"}'
   ```

### Testando visualmente (playground)

Pra quem prefere digitar um texto e ver o resultado em vez de mexer com
curl, tem uma página local em `tools/ai-playground.html`. Ela faz login com
o usuário de teste, salva o texto digitado no `quote_id` de exemplo, chama
`interpret-quote` de verdade (com `force_reprocess: true`, então cada clique
gera uma nova interpretação) e mostra o resultado formatado + o JSON cru.

Não é parte do app nem é publicada em lugar nenhum - é só um arquivo HTML
autocontido (sem build, sem dependências) que fala direto com a stack local.

1. Ter a stack local rodando (`supabase start`) e a function servindo com a
   chave da OpenAI configurada (`supabase functions serve interpret-quote
   --env-file supabase/functions/interpret-quote/.env.local`).
2. Abrir `tools/ai-playground.html` direto no navegador (duplo-clique ou
   `xdg-open tools/ai-playground.html`).
3. Editar o texto na caixa da esquerda e clicar em "Interpretar".

Os campos de configuração no topo (URL da API, usuário/senha de teste,
`quote_id`) já vêm preenchidos com os valores padrão do `seed.sql`; só
precisa mexer neles se você mudou algo local.

### Comparando modelos e custo estimado

`packages/shared/src/ai/model-pricing.ts` tem uma tabela com o preço (input/
input em cache/output, em centavos de dólar por 1M de tokens) de cada modelo
da OpenAI que a gente já testou. É usada automaticamente pela
`interpret-quote` pra calcular `estimated_cost_cents` em `ai_interpretations`
- não precisa mais configurar preço por variável de ambiente. Modelo fora da
tabela = custo fica `null` (nunca um número chutado). **Atualize essa tabela
quando a OpenAI mudar os preços.**

O select "Modelo" no playground (`tools/ai-playground.html`) deixa escolher,
por chamada, um modelo diferente do `OPENAI_MODEL` configurado no
`.env.local` - só precisa estar na tabela de preços acima (é uma allowlist,
não aceita qualquer nome). Serve pra comparar custo/qualidade entre modelos
sem precisar reiniciar a function a cada troca. A lista de modelos no HTML é
uma cópia da tabela em `model-pricing.ts` (o playground é estático, sem
build, então não dá pra importar direto) - atualize os dois juntos.

Sem `.env.local` preenchido com uma chave válida, a function ainda responde
(auth, RLS e gravação em `ai_interpretations` funcionam), mas a chamada à
OpenAI falha com `502 {"message":"AI request failed"}` - é o esperado.

### Acessos úteis quando a stack local está rodando

Esses valores aparecem na saída de `pnpm exec supabase status`:

- **Studio (interface visual do banco):** http://127.0.0.1:54323
- **API REST/Auth/Storage:** http://127.0.0.1:54321
- **Postgres (para clientes como `psql`, DBeaver, TablePlus):** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **E-mails de teste (Mailpit):** http://127.0.0.1:54324

As chaves `ANON_KEY` e `SERVICE_ROLE_KEY` mostradas por `supabase status` são
fixas para qualquer instalação local do Supabase (não são segredos reais) e já
estão documentadas em `apps/mobile/.env.example`.

## Fluxo do dia a dia (Supabase)

1. `pnpm exec supabase start` ao começar a trabalhar.
2. Editar/criar migrações em `supabase/migrations/` conforme o schema evolui.
3. `pnpm exec supabase db reset` para aplicar do zero e conferir que tudo roda sem erro.
4. `pnpm exec supabase stop` ao terminar (libera memória/CPU do Docker).

## Expo / EAS (app mobile)

Todos os comandos abaixo devem ser rodados dentro de `apps/mobile`
(`cd apps/mobile`), a não ser que indicado.

### Rodar o app localmente

| Comando | O que faz |
| --- | --- |
| `pnpm --filter @orcaai/mobile web` | Sobe o app no navegador (mais rápido para testar telas/lógica; não testa comportamento nativo). |
| `pnpm --filter @orcaai/mobile start` | Sobe o Metro bundler e mostra um QR code, para abrir no **Expo Go**. |
| `pnpm --filter @orcaai/mobile start --dev-client` | Mesma coisa, mas para abrir no **development build** instalado no celular (ver abaixo). |

### Expo Go vs. development build

O **Expo Go** é o app genérico da loja: rápido para começar, mas só suporta a
versão de SDK do Expo que ele mesmo publicou por último. Se aparecer o erro
`project is incompatible with this version of Expo Go`, geralmente é porque o
projeto está numa versão de SDK mais nova que o Expo Go instalado no celular
(experimentar atualizar o Expo Go na loja resolve às vezes, mas nem sempre).

O **development build** é um app próprio do OrçaAI (não o Expo Go), instalado
uma vez no celular via EAS Build. Depois de instalado, funciona como o Expo Go
(hot reload via `start --dev-client`), mas sem a limitação de versão — e é o
único jeito de usar dependências nativas que o Expo Go não inclui. Foi o
caminho escolhido aqui depois de esbarrar na incompatibilidade acima.

### EAS CLI

| Comando | O que faz |
| --- | --- |
| `pnpm exec eas login` | Autentica o EAS CLI com sua conta Expo (cria uma grátis se não tiver). Feito uma vez por máquina. |
| `pnpm exec eas build --profile development --platform android` | Builda o development build na nuvem (grátis, com cota mensal limitada no plano free) e mostra um QR code/link para instalar o `.apk` no celular. |
| `pnpm exec eas build --profile development --platform ios` | Mesma coisa para iOS — precisa de TestFlight ou dispositivo registrado na conta Apple, é mais burocrático. |
| `pnpm exec eas build:list` | Lista builds anteriores e o status de builds em andamento. |

O perfil `development` está definido em `apps/mobile/eas.json`. Um novo build
só é necessário ao adicionar uma dependência **nativa** nova (ex.:
`expo install <lib>`); mudanças de JS/TS recarregam na hora via
`start --dev-client`, sem precisar rebuildar.

### Conexão com o Supabase e sessão de teste (Fase 1)

O app fala com o Supabase via `apps/mobile/src/lib/supabase.ts`, usando
`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` do `.env.local`
(ver `.env.example`). Para isso funcionar:

1. `pnpm exec supabase start` (stack local rodando).
2. `pnpm exec supabase functions serve interpret-quote --env-file
   supabase/functions/interpret-quote/.env.local` (senão a tela do editor
   carrega, mas "Continuar" falha ao chamar a IA).

Como autenticação de verdade é escopo da Fase 2 (RF-001), o app por
enquanto loga automaticamente com o mesmo usuário de teste do
`supabase/seed.sql` (`apps/mobile/src/lib/test-session.ts`) - é um
placeholder, não algo para produção. Isso significa que rodar o app local
sem a stack do Supabase rodando (ou sem o seed aplicado) faz o login
automático falhar.

Se mexer no schema de `packages/shared` (ex.: campo novo no `quote_items`),
lembre de rodar `pnpm install` na raiz para o Metro/tsc enxergarem a
mudança - o app importa `@orcaai/shared` como pacote do workspace pnpm
(configurado em `apps/mobile/metro.config.js`).

### Fluxo do dia a dia (app)

1. `pnpm --filter @orcaai/mobile web` para iteração rápida no navegador.
2. De vez em quando, `pnpm --filter @orcaai/mobile start --dev-client` para
   validar no celular de verdade (teclado, gestos, tamanho de tela real).
3. Só rodar `eas build` de novo se uma dependência nativa foi adicionada
   desde o último build instalado.

### Gerar e compartilhar o PDF do orçamento (Task 6/7)

Na tela do editor (`/quote/[quoteId]`), o card "Gerar orçamento" deixa
escolher o modo (completo/separado/só serviço/só material) e depois:

- **Completo / só serviço / só material:** abre uma prévia (modal com o
  HTML renderizado) antes de compartilhar. Botão "Compartilhar PDF" dentro
  da prévia.
- **Separado:** gera e compartilha os 2 PDFs (serviço + material) direto,
  sem prévia.

No **celular/development build**, o compartilhamento usa de verdade
`expo-print` (gera o PDF) + `expo-sharing` (abre o menu nativo do sistema)
- é o fluxo real da RF-066.

No **navegador** (`pnpm --filter @orcaai/mobile web`), não existe menu de
compartilhamento nativo nem geração de PDF de verdade via `expo-print`
(no alvo web essas libs têm comportamento bem mais limitado - ver notas na
Task 7 do arquivo de tarefas). Por isso, no navegador, "Compartilhar PDF"
baixa o HTML do orçamento como arquivo (`orcamento.html`); para virar PDF,
abra o arquivo baixado e use "Imprimir > Salvar como PDF" do próprio
navegador. Isso é só uma limitação do teste no navegador - no app nativo
não tem esse passo extra.

### Se o app não refletir mudanças recentes (bundle desatualizado)

Não há Watchman instalado nesta máquina, então o Metro usa o watcher padrão
do Node para detectar mudanças em arquivo. Ocasionalmente (mais visto ao
**criar um arquivo novo**, não só editar um existente) o Metro não percebe a
mudança e continua servindo o bundle antigo em `pnpm --filter @orcaai/mobile
web`/`expo start --web`, sem erro nenhum - o app no navegador simplesmente
continua rodando o código de antes. Se uma mudança não aparecer mesmo após
salvar o arquivo e recarregar a página, mate o processo do Expo/Metro
(`pkill -f "expo start"` ou feche o terminal) e suba de novo com `--clear`:

```bash
pnpm --filter @orcaai/mobile exec expo start --web --port 8090 --clear
```

O `--clear` limpa o cache de transformação do Metro e força ele a reler
todos os arquivos do zero.

### Se `pnpm add`/`pnpm install` der "Unexpected store location"

```
Error: [ERR_PNPM_UNEXPECTED_STORE] Unexpected store location
```

Acontece se o caminho do store global do pnpm mudar no meio da sessão (ex.:
o VSCode instalado via snap atualiza de revisão e o `$HOME` efetivo do
processo muda). O node_modules já existente fica "preso" apontando pro
store antigo. Contorno rápido, sem precisar reinstalar tudo: aponte
explicitamente pro store antigo nesse comando específico (o caminho antigo
aparece na própria mensagem de erro, em "currently linked from the store
at..."):

```bash
pnpm --store-dir <caminho-do-store-antigo> add <pacote>
```

### Se dados do seed (`test@orcaai.local`) sumirem sem rodar `db reset`

Já aconteceu uma vez nesta máquina, sem causa raiz confirmada (suspeita:
algum ciclo rápido de `supabase stop`/`start` no meio de outra operação
pode ter deixado o volume do Postgres num estado inconsistente por um
instante) - a organização do seed (`22222222-2222-4222-8222-222222222222`)
sumiu enquanto o usuário `test@orcaai.local` continuava existindo, sem eu
ter rodado `db reset` nem qualquer DELETE manual. Se isso se repetir (o
usuário de teste do seed loga mas cai no onboarding em vez de ir direto
pro app), o jeito mais rápido de resolver é só rodar
`pnpm exec supabase db reset` de novo - reaplica migrações e seed do zero.
