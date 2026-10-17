# OrçaAI

Aplicativo mobile para transformar descrições informais de serviços em
orçamentos profissionais, revisáveis e compartilháveis.

## Problema

Prestadores de serviço recebem ou registram informações de um trabalho de forma
livre, normalmente por mensagem. Para criar um orçamento, alguém precisa
interpretar o texto, corrigir a escrita, organizar os itens, calcular os valores,
montar um documento e exportá-lo para PDF.

O OrçaAI reduz esse trabalho sem retirar o controle do profissional:

1. O prestador escreve, fala ou fotografa a descrição, como já está acostumado.
2. A IA organiza a informação e aponta o que está faltando.
3. O usuário revisa e confirma os dados.
4. O aplicativo calcula os totais e gera o PDF.
5. O orçamento pode ser compartilhado pelo WhatsApp, e-mail ou outros apps.

## Princípios do produto

- Simples antes de completo.
- Revisão humana obrigatória antes da emissão.
- IA interpreta texto; regras determinísticas calculam dinheiro.
- Nenhum dado ausente deve ser inventado.
- O usuário sempre pode editar manualmente.
- A experiência principal precisa funcionar bem em celulares Android simples.

## Estado atual (outubro de 2026)

Pronto para o **teste fechado** com 10 a 20 prestadores (Android, APK fora da
loja, atualizações de JavaScript por EAS Update). Público inicial: autônomos de
pintura e serviços gerais no Brasil.

**O app já faz:**

- login com Google, perfil da empresa com logo e condições comerciais padrão;
- cadastro rápido de clientes;
- orçamento por **texto, áudio ou imagem** (foto de bilhete, print de conversa)
  - o texto extraído é sempre revisado antes de interpretar;
- interpretação estruturada por IA, perguntas sobre o que falta e destaque do
  que é incerto;
- editor com cálculo de subtotal, desconto e total (recalculado no servidor),
  rascunho salvo no aparelho;
- emissão com numeração, versões imutáveis e PDF (completo, só serviços, só
  materiais ou separado), salvo em armazenamento privado;
- histórico, busca, filtros e estados comerciais (enviado, aprovado,
  recusado, expirado);
- planos **Gratuito** (3 orçamentos emitidos por mês, PDF com marca do OrçaAI)
  e **Profissional** - cobrança manual, ativada no painel admin;
- exclusão de conta com prazo de 7 dias para desistir;
- seção de ajuda com o contato de suporte (configurado no painel admin).

**Operação:**

- **Painel admin** dentro do app (só para o administrador da plataforma):
  organizações, uso, limites de IA, planos, suspensão, auditoria - sem nunca
  mostrar o conteúdo dos orçamentos.
- **Painel de métricas** no Grafana Cloud: custo e latência da IA, uso por
  organização, funil, tempo até compartilhar, qualidade da IA.
- **Erros** no Sentry e **alerta de custo diário** de IA.
- Limites anti-abuso de IA por organização a cada 24h.

**Ainda não:** duplicar orçamento, regerar PDF, feedback sobre a
interpretação (RF-081), publicação nas lojas, pagamento automático, aprovação
por link, equipes. Ver [Roadmap](docs/ROADMAP.md).

## Stack

- **App:** React Native com Expo (SDK 57), Expo Router, React Native Paper,
  TypeScript.
- **Backend:** Supabase - Postgres com RLS por organização, Auth (Google),
  Storage privado, Edge Functions (Deno) e funções SQL para o painel admin.
- **IA:** OpenAI Responses API com Structured Outputs (interpretação e leitura
  de imagem) e transcrição de áudio; modelo configurável por ambiente.
- **PDF:** gerado no próprio app a partir de um template HTML compartilhado
  (`packages/shared`) e salvo no Storage na emissão.
- **Monitoramento:** Sentry (com filtro que remove dados pessoais) e métricas
  no próprio banco, lidas pelo Grafana Cloud por um usuário só de leitura.
- **Distribuição:** EAS Build (APK, também local) e EAS Update.

## Estrutura do repositório

| Pasta | O que tem |
| --- | --- |
| `apps/mobile` | o app Expo |
| `packages/shared` | código comum ao app e às functions: schemas (Zod), cálculos, prompts, template do PDF, tabela de preços da IA, filtro do Sentry - com testes (Vitest) |
| `supabase/migrations` | o banco: tabelas, RLS, views de métricas, funções do painel |
| `supabase/functions` | Edge Functions (IA, emissão, PDF, exclusão de conta, alerta de custo) |
| `ops/grafana` | o dashboard do Grafana, versionado |
| `tools` | scripts de teste contra a stack local e o playground da IA |
| `docs` | documentação (abaixo) |

## Documentação

- [PRD](docs/PRD.md) - o produto: público, requisitos, regras, métricas.
- [Arquitetura](docs/ARCHITECTURE.md) - decisões técnicas e modelo de dados.
- [Roadmap](docs/ROADMAP.md) - fases e o que já foi feito.
- [Ambiente local](docs/AMBIENTE_LOCAL.md) - como rodar, testar, publicar e
  operar (Supabase, Expo/EAS, Grafana, painel admin, planos).
- [Política de privacidade](docs/POLITICA_DE_PRIVACIDADE.md) - rascunho para
  o teste fechado.

**Rodar localmente:** `pnpm install` e depois `pnpm run dev` (sobe o Supabase
local, as Edge Functions e o Expo web) - detalhes e pré-requisitos em
[Ambiente local](docs/AMBIENTE_LOCAL.md).

## Métrica principal

Tempo mediano entre iniciar a descrição e compartilhar um orçamento confirmado
(medido no Grafana, painel "Tempo até compartilhar").

Meta inicial: menos de 3 minutos, com pelo menos 80% dos orçamentos exigindo
apenas pequenos ajustes após a interpretação.
