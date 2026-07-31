# PRD - OrçaAI

## 1. Visão

O OrçaAI ajuda prestadores de serviço a produzir orçamentos profissionais a
partir da linguagem que já usam no dia a dia.

O produto não é um chatbot genérico nem apenas um gerador de PDF. Seu valor está
na combinação de:

- captura rápida;
- interpretação assistida;
- confirmação explícita;
- cálculo confiável;
- documento profissional;
- histórico reutilizável.

## 2. Público inicial

### Persona principal

Prestador autônomo ou microempreendedor que:

- trabalha em campo;
- usa principalmente Android e WhatsApp;
- cria de 5 a 40 orçamentos por mês;
- não quer aprender um sistema administrativo complexo;
- pode ter pouca familiaridade com planilhas;
- precisa passar credibilidade e responder rapidamente ao cliente.

### Persona secundária

Pessoa que auxilia o prestador na administração e hoje transforma mensagens em
planilhas ou PDFs.

### Mercado inicial

Pintores e profissionais de serviços gerais no Brasil. Depois da validação, o
mesmo núcleo pode atender eletricistas, encanadores, instaladores, marceneiros,
limpeza, manutenção e pequenas reformas.

## 3. Hipóteses a validar

1. O maior valor percebido é ganhar tempo, não apenas deixar o PDF bonito.
2. Texto livre reduz mais atrito do que um formulário tradicional.
3. O usuário aceita revisar uma tela estruturada antes de gerar o documento.
4. Um único modelo de PDF configurável é suficiente para o MVP.
5. Compartilhar pelo menu nativo atende melhor ao início do que integrar
   diretamente com a API do WhatsApp.
6. Profissionais pagarão uma assinatura pequena depois de experimentar o fluxo.
7. Áudio será importante, mas texto já é suficiente para validar o núcleo.

## 4. Jornada principal

### Primeiro acesso

1. Usuário informa nome, telefone e método de acesso.
2. Configura nome comercial, CPF/CNPJ opcional, endereço, logotipo e condições
   padrão.
3. Visualiza uma prévia do orçamento.
4. Pode criar o primeiro orçamento sem concluir campos opcionais.

### Criar orçamento

1. Usuário toca em "Novo orçamento".
2. Seleciona um cliente existente ou cria um cliente rápido.
3. Digita uma mensagem livre.
4. Aplicativo envia o texto para interpretação.
5. Aplicativo exibe itens, valores, condições e observações extraídas.
6. Campos incertos ficam destacados.
7. O sistema faz somente as perguntas necessárias.
8. Usuário corrige e confirma.
9. Regras locais/backend calculam os totais.
10. Usuário visualiza o documento e gera a versão final.
11. Usuário compartilha pelo menu nativo do celular.

### Exemplo de entrada

> Pintura da casa da dona Maria, duas demãos nas paredes da sala e dos 3
> quartos. Material por conta dela. Mão de obra 2800, metade na entrada e o
> restante quando terminar. Leva uns 5 dias. Validade 10 dias.

### Resultado estruturado esperado

- Cliente: Maria, ainda sem telefone/endereço.
- Item: pintura de paredes da sala, duas demãos.
- Item: pintura de paredes de três quartos, duas demãos.
- Material: fornecido pelo cliente.
- Mão de obra: R$ 2.800,00.
- Pagamento: 50% na contratação e 50% na conclusão.
- Prazo estimado: 5 dias.
- Validade: 10 dias.
- Pergunta: é necessário incluir preparação, correções ou proteção do ambiente?

## 5. Escopo do MVP

### Conta e empresa

- RF-001: criar conta por e-mail com código ou link de acesso.
- RF-002: manter sessão no dispositivo.
- RF-003: editar perfil profissional.
- RF-004: cadastrar nome comercial, documento, contatos e endereço.
- RF-005: enviar logotipo.
- RF-006: configurar validade, observações e condições padrão.
- RF-007: excluir conta e solicitar exclusão dos dados.

Telefone com OTP pode ser adicionado depois; SMS aumenta custo e complexidade do
primeiro lançamento.

### Clientes

- RF-010: criar, editar, buscar e arquivar cliente.
- RF-011: armazenar nome, telefone, e-mail, documento e endereço opcionais.
- RF-012: criar cliente rápido informando apenas o nome.
- RF-013: reutilizar dados do cliente em novos orçamentos.

### Captura e IA

- RF-020: aceitar texto livre em português brasileiro.
- RF-021: preservar o texto original para auditoria e nova interpretação.
- RF-022: extrair cliente, local, escopo, itens, quantidades, unidades, valores,
  materiais, prazo, pagamento, validade e observações.
- RF-023: devolver resultado compatível com um schema versionado.
- RF-024: informar confiança e origem textual de campos relevantes.
- RF-025: identificar campos ausentes, ambíguos ou conflitantes.
- RF-026: gerar perguntas curtas e específicas.
- RF-027: nunca preencher preço, quantidade, prazo ou documento sem evidência.
- RF-028: permitir reprocessamento após resposta do usuário.
- RF-029: permitir abandonar a IA e editar tudo manualmente.
- RF-030: impedir geração final enquanto houver erro crítico.

### Editor e cálculos

- RF-040: adicionar, editar, ordenar e remover itens.
- RF-041: suportar item por quantidade e valor unitário.
- RF-042: suportar item com preço fechado.
- RF-043: classificar item como serviço, material ou outro.
- RF-044: calcular subtotal por item e orçamento.
- RF-045: aplicar desconto fixo ou percentual.
- RF-046: exibir total final em BRL.
- RF-047: formatar valores segundo `pt-BR`.
- RF-048: permitir observações, inclusões, exclusões e condições.
- RF-049: validar números negativos, percentuais inválidos e campos obrigatórios.

Todos os valores monetários devem ser armazenados em centavos inteiros. A IA
propõe dados, mas nunca é a autoridade dos cálculos.

### Documento

- RF-060: atribuir número sequencial por empresa.
- RF-061: gerar PDF com dados do prestador, cliente, itens, total e condições.
- RF-062: mostrar prévia antes da emissão.
- RF-063: registrar data, validade e versão do orçamento.
- RF-064: manter a versão emitida imutável.
- RF-065: criar nova versão quando um orçamento emitido for alterado.
- RF-066: baixar e compartilhar o PDF pelo menu nativo.
- RF-067: duplicar um orçamento como novo rascunho.

### Histórico

- RF-070: listar orçamentos recentes.
- RF-071: buscar por cliente, número ou texto.
- RF-072: filtrar por estado e período.
- RF-073: marcar como enviado, aprovado, recusado ou expirado.
- RF-074: exibir linha do tempo mínima de criação, emissão e alterações de estado.

### Suporte operacional

- RF-080: registrar falhas de interpretação e geração de PDF.
- RF-081: permitir feedback positivo/negativo sobre a interpretação.
- RF-082: oferecer canal de suporte sem expor automaticamente o conteúdo do
  orçamento.

## 6. Fora do MVP

- emissão de nota fiscal;
- controle financeiro completo;
- estoque;
- agenda de obras;
- assinatura eletrônica com validade jurídica avançada;
- cobrança via Pix ou cartão;
- aprovação por link público;
- múltiplos usuários por empresa;
- integração oficial com WhatsApp Business;
- leitura automática de plantas ou fotos;
- precificação automática baseada no mercado;
- funcionamento totalmente offline;
- versão web administrativa completa.

## 7. Regras de negócio

1. Um orçamento pertence a uma empresa e a um usuário autorizado.
2. Rascunhos podem ser alterados livremente.
3. Uma versão emitida não é sobrescrita.
4. Duplicar cria outro número somente na emissão.
5. Desconto percentual deve estar entre 0% e 100%.
6. Totais são sempre recalculados no backend antes da emissão.
7. A data de validade resulta de uma data explícita ou de dias após a emissão.
8. Campos não informados permanecem vazios ou são marcados para confirmação.
9. Termos vagos como "material incluso" não devem gerar lista fictícia.
10. O PDF deve indicar que é um orçamento, não uma nota fiscal.

## 8. Estados

```text
rascunho -> pronto_para_revisao -> emitido -> enviado
                                      |          |
                                      |          +-> aprovado
                                      |          +-> recusado
                                      |          +-> expirado
                                      +-> substituido_por_nova_versao
```

Falha da IA não altera o estado comercial. Ela é um estado do processamento:
`pendente`, `processando`, `concluido` ou `falhou`.

## 9. Requisitos não funcionais

- RNF-001: telas principais devem responder em até 300 ms para ações locais.
- RNF-002: interpretação deve concluir preferencialmente em até 10 segundos.
- RNF-003: geração de PDF deve concluir preferencialmente em até 8 segundos.
- RNF-004: operações de emissão devem ser idempotentes.
- RNF-005: dados de empresas diferentes devem ser isolados por RLS no banco.
- RNF-006: chaves de IA nunca podem estar no aplicativo.
- RNF-007: conexões externas devem usar TLS.
- RNF-008: logs não devem conter texto integral, documentos ou telefone.
- RNF-009: app deve ter mensagens de erro acionáveis e opção de tentar novamente.
- RNF-010: interface deve suportar fonte ampliada e áreas de toque adequadas.
- RNF-011: fluxo principal deve ser utilizável em Android intermediário/entrada.
- RNF-012: alterações de schema da IA devem ser versionadas e testadas.
- RNF-013: backups devem existir antes do uso comercial.
- RNF-014: usuário deve conseguir exportar ou excluir seus dados.
- RNF-015: disponibilidade alvo inicial de 99,5%, sem promessa contratual no MVP.

## 10. Critérios de aceite do fluxo central

O MVP está validável quando um usuário consegue:

1. Configurar o perfil em menos de 5 minutos.
2. Colar uma mensagem real e obter itens editáveis.
3. Entender visualmente o que foi extraído e o que precisa confirmar.
4. Corrigir qualquer campo sem reenviar o texto.
5. Gerar um PDF sem divergência entre itens e total.
6. Compartilhar o PDF no WhatsApp pelo menu nativo.
7. Encontrar e duplicar o orçamento posteriormente.

Teste de qualidade inicial: conjunto anonimizado de pelo menos 100 mensagens
reais, avaliando extração por campo e taxa de invenção. Qualquer preço inventado
é falha crítica.

## 11. Métricas

### North star

- tempo mediano até compartilhar um orçamento confirmado.

### Ativação

- percentual que configura o perfil e emite o primeiro orçamento;
- tempo até o primeiro orçamento;
- abandono em cada etapa.

### Qualidade da IA

- percentual aceito sem alteração;
- média de campos alterados;
- taxa de pergunta necessária;
- taxa de informação inventada;
- falhas de schema e reprocessamentos.

### Retenção e negócio

- usuários que emitem orçamento na semana 1, 4 e 8;
- orçamentos por usuário ativo;
- conversão de teste para assinatura;
- custo de IA por orçamento;
- taxa declarada de aprovação dos orçamentos.

## 12. Monetização a testar

Modelo sugerido:

- Gratuito: até 3 orçamentos emitidos por mês, com identidade discreta do OrçaAI.
- Profissional: limite mais alto, sem marca, logotipo e modelos personalizados.
- Futuro Equipe: usuários adicionais, permissões e visão administrativa.

Não fechar preço antes de entrevistar usuários. Faixa de teste qualitativo:
R$ 19 a R$ 49 por mês para o plano individual.

## 13. Pesquisa com usuários

Antes de desenvolver todas as integrações:

1. Reunir 20 a 50 mensagens reais, removendo dados pessoais.
2. Entrevistar de 5 a 8 prestadores de pelo menos três especialidades.
3. Observar a criação atual de um orçamento.
4. Testar protótipo clicável com texto real do participante.
5. Perguntar sobre frequência, erros, tempo, compartilhamento e disposição a
   pagar.
6. Executar um concierge MVP: produzir alguns orçamentos pelo fluxo proposto e
   medir retrabalho.

Perguntas-chave:

- Quem cria o orçamento hoje?
- Quanto tempo leva?
- O que costuma faltar na primeira mensagem?
- O cliente pede alterações? Como elas são controladas?
- O orçamento inclui material e mão de obra separados?
- Existe tabela de preços recorrente?
- O profissional prefere falar, escrever ou encaminhar áudio?
- O que faria o documento parecer profissional?
- Qual erro seria inaceitável?

## 14. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| IA inventar preço ou escopo | Alto | schema estrito, evidência, confirmação e testes |
| Usuário confiar sem revisar | Alto | confirmação explícita e destaque de incertezas |
| Formulário ainda parecer complexo | Alto | cliente rápido, padrões e revelação progressiva |
| Custo variável de IA | Médio | modelo econômico, limites, cache e telemetria |
| PDFs divergirem dos dados | Alto | renderização a partir de snapshot versionado |
| Vazamento entre empresas | Alto | RLS, testes de autorização e backend autenticado |
| Baixa disposição a pagar | Alto | concierge MVP e teste de preço antes de escala |
| Dependência de fornecedor | Médio | schema próprio e camada de provedor de IA |
| Confusão com documento fiscal | Médio | rotulagem e termos claros |

## 15. Decisões pendentes

- O primeiro acesso será por e-mail ou telefone?
- Áudio entra no MVP ou na primeira evolução?
- O profissional precisa separar mão de obra e material em todos os casos?
- Endereço da obra pertence ao cliente ou ao orçamento?
- Deve existir campo para área em m² com preço unitário?
- O orçamento precisa de fotos anexas?
- Validade e garantia devem ter padrões por categoria de serviço?
- O cliente aprovará apenas informalmente ou por um link?

