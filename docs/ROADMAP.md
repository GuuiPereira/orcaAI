# Roadmap - OrçaAI

O roadmap é orientado por validação. Datas só devem ser fechadas depois de
conhecer a disponibilidade da equipe.

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

