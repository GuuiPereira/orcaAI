# Roadmap - OrçaAI

O roadmap é orientado por validação. Datas só devem ser fechadas depois de
conhecer a disponibilidade da equipe.

## Onde estamos (2026-10-17)

**Pronto para o teste fechado (saída da Fase 2).** Além do MVP fechado, já
foram antecipados a entrada por áudio/imagem (Fase 4A), a parte de planos da
Fase 3 (com cobrança manual) e duas trilhas de operação (Grafana e painel
admin). O próximo marco é colocar 10 a 20 prestadores usando por quatro
semanas - o resto se prioriza com o que aparecer nesse teste.

O detalhe de cada fase (decisões, testes, pendências) fica nos arquivos de
task (`.tasks/`, fora do repositório); como rodar e operar cada parte está em
[AMBIENTE_LOCAL.md](AMBIENTE_LOCAL.md).

## Fase 0 - Descoberta

Objetivo: confirmar problema, linguagem e fluxo antes de escrever o produto.

- entrevistar 5 a 8 prestadores;
- reunir e anonimizar 100 mensagens;
- levantar os modelos atuais de orçamento;
- mapear campos realmente usados;
- testar disposição a pagar;
- criar protótipo clicável;
- definir métricas e eventos.

Saída: PRD revisado e decisão de continuar, alterar nicho ou interromper.

**Status:** parcial - as entrevistas e o teste de disposição a pagar ficaram
para o teste fechado (PRD §13).

## Fase 1 - Prova do núcleo

Objetivo: provar mensagem -> estrutura -> revisão -> PDF.

- schema de orçamento;
- tela de texto livre;
- função de interpretação;
- editor estruturado;
- cálculos;
- um template de PDF;
- compartilhamento local;
- dataset e avaliação inicial.

Pode operar com autenticação simplificada e sem histórico completo, mas nunca
sem confirmação ou validação dos totais.

Saída: teste acompanhado com o pai do idealizador e 2 a 3 profissionais.

**Status:** concluída.

## Fase 2 - MVP fechado

Objetivo: permitir uso real recorrente por um grupo pequeno.

- autenticação;
- perfil do prestador;
- clientes;
- histórico e busca;
- versões imutáveis;
- Storage privado;
- RLS;
- analytics sanitizado;
- monitoramento;
- exclusão de conta;
- distribuição Android para testadores.

Saída: 10 a 20 usuários usando por quatro semanas.

**Status:** construída e publicada (projeto Supabase hospedado, APK 1.1.0,
EAS Update). Antes de convidar os testadores faltam: teste de um crash
nativo chegando ao Sentry, canal de feedback e a política de privacidade
acessível (rascunho em [POLITICA_DE_PRIVACIDADE.md](POLITICA_DE_PRIVACIDADE.md)).
Sobras da emissão: duplicar orçamento (RF-067) e regerar PDF.

## Fase 3 - Beta comercial

Objetivo: validar retenção e monetização.

- onboarding refinado;
- limites por plano;
- assinatura;
- recuperação de falhas;
- suporte;
- política de privacidade e termos revisados;
- publicação nas lojas;
- painel mínimo de operação;
- testes de carga e segurança.

Saída: primeiros usuários pagantes e custo por orçamento conhecido.

**Status:** em parte antecipada.

- **Limites por plano / assinatura - etapa 1 feita:** planos Gratuito (3
  orçamentos emitidos por mês, PDF com marca, sem logo e sem áudio/imagem) e
  Profissional, com **cobrança manual** (o admin ativa o plano, com validade).
  Pagamento automático só com o app na loja (regras do Google Play a
  reconferir). Antes de cobrar: preço (após entrevistas), termos de uso e
  forma de receber/emitir nota.
- **Painel mínimo de operação - feito:** painel admin no app + Grafana.
- **Suporte - em parte:** contato de suporte configurável no painel e
  exibido no app; falta o feedback sobre a interpretação (RF-081).
- **Custo por orçamento conhecido - feito:** medido no Grafana.
- Pendentes: onboarding refinado, termos de uso, revisão jurídica da
  política, publicação nas lojas, testes de carga e segurança.

## Fase 4 - Evoluções guiadas por uso

Priorizar somente com evidência:

- entrada por áudio;
- catálogo de serviços e preços próprios;
- fotos e anexos;
- link de aprovação do cliente;
- assinatura;
- cobrança/Pix;
- lembretes;
- conversão de orçamento em ordem de serviço;
- equipes;
- painel web;
- modelos por especialidade.

**Status:**

- **Entrada por áudio e por imagem (4A) - feita**, antecipada antes do teste
  fechado: o texto extraído é sempre revisado antes de interpretar; a mídia
  não é guardada.
- Aprovação por link (4B) e equipes (4C): só documentadas, aguardando
  evidência de uso. "Fotos e anexos" do orçamento seguem como decisão
  pendente do PRD (§15).
- "Painel web": a operação ganhou um painel admin dentro do app (ver
  trilhas abaixo); um painel web separado não está previsto.

## Trilhas de operação (fora da numeração do produto)

| Trilha | Status |
| --- | --- |
| **Painel de métricas (Grafana Cloud)** | feito - views `metrics_*` no próprio banco, lidas por um papel só de leitura; dashboard versionado em `ops/grafana/` |
| **Painel admin** | feito - organizações, limites de IA, planos, suspensão, destravar interpretação, contato de suporte; toda ação auditada; nunca mostra conteúdo de orçamento |
| **Segurança da IA** | planejada - teto de custo por chamada, recusa de pedidos fora de contexto e detecção de uso mal-intencionado |

## Backlog inicial

### P0

- schema de dados e IA;
- avaliação contra mensagens reais;
- editor e cálculos;
- confirmação;
- PDF consistente;
- compartilhamento;
- RLS e armazenamento privado.

### P1

- cadastro de clientes;
- padrões comerciais;
- duplicação;
- busca e filtros;
- estados comerciais;
- telemetria e feedback da IA.

### P2

- áudio;
- fotos;
- aprovação por link;
- assinatura;
- cobrança;
- colaboração.

## Gate de lançamento

Não abrir beta comercial enquanto:

- houver qualquer caso conhecido de preço inventado sem alerta;
- totais do PDF puderem divergir do editor;
- testes de RLS entre organizações falharem;
- exclusão e recuperação de conta não estiverem definidas;
- não existirem alertas de custo e erro;
- o fluxo não tiver sido usado com mensagens reais.

Situação em 2026-10-17: totais recalculados no servidor e PDF gerado do
mesmo snapshot; RLS testado com duas contas em cada fase; exclusão de conta
com 7 dias para desistir; alerta de custo diário e erros no Sentry. Falta o
uso com mensagens reais (é o teste fechado) e a medição de preço inventado
nesse uso.

