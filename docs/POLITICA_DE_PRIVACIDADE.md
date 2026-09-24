# Política de Privacidade do OrçaAI

**Versão 0.1 (rascunho para o teste fechado) - 24/09/2026**

> **Status:** rascunho escrito a partir do que o app realmente faz hoje (código,
> banco e fornecedores conferidos em 24/09/2026). Os trechos `[PREENCHER: ...]`
> dependem de informação do responsável. **Não substitui revisão jurídica** -
> para o teste fechado com pessoas conhecidas ela cumpre o papel de
> transparência; antes de abrir ao público ou cobrar, um advogado deve revisar
> (ver `docs/ROADMAP.md`, Fase 3).

Esta política explica, em linguagem simples, quais dados o OrçaAI usa, para
quê, com quem passam por ali e como você exerce seus direitos, conforme a Lei
Geral de Proteção de Dados (LGPD - Lei 13.709/2018).

## 1. Quem é o responsável

O OrçaAI é um aplicativo que ajuda prestadores de serviço a montar orçamentos
a partir de um texto, um áudio ou uma imagem.

- **Responsável pelo aplicativo:** `[PREENCHER: nome completo ou razão social + CPF/CNPJ]`
- **Contato para assuntos de privacidade:** `[PREENCHER: e-mail]`

Existem dois papéis diferentes:

- **Seus dados** (sua conta e os dados da sua empresa): o OrçaAI é o
  **controlador** - decide para que usá-los.
- **Dados dos seus clientes** que você digita ou fotografa para montar um
  orçamento (nome, telefone, endereço...): **você** é o controlador, porque
  decide para quem e por que orçar; o OrçaAI atua como **operador**, tratando
  esses dados só para prestar o serviço que você pediu. Use apenas dados que
  você tem o direito de usar para esse fim.

## 2. Quais dados coletamos

| Grupo | O que | De onde vem |
| --- | --- | --- |
| **Conta** | nome e e-mail da sua conta Google; telefone, se você informar | login com Google; seu perfil |
| **Sua empresa** | nome fantasia, razão social, CPF/CNPJ, telefone, e-mail, endereço, logotipo, condições comerciais padrão | você preenche no Perfil |
| **Seus clientes** | nome, telefone, e-mail, documento, endereço, observações | você cadastra ou escreve no orçamento |
| **Orçamentos** | o texto original, os itens e valores, local do serviço, condições, versões emitidas e o PDF gerado | você cria; o PDF é gerado pelo app |
| **Áudio e imagens** | o áudio que você grava e as fotos/prints que anexa (ver seção 4) | você anexa |
| **Uso técnico** | para cada leitura de áudio/imagem: tipo, duração ou nº de imagens, tamanho, modelo usado, custo estimado, tempo e se deu certo. Para cada interpretação: status, versão do modelo, custo | gerado pelo sistema, **sem o conteúdo** |
| **Erros do app** | mensagem técnica do erro, versão do app, modelo/sistema do aparelho e o identificador interno da sua conta | enviado automaticamente quando algo quebra; **sem o conteúdo dos seus orçamentos** |
| **No seu aparelho** | sessão de login e o rascunho do texto que você está escrevendo | fica só no aparelho |

Não coletamos localização, contatos do telefone, nem usamos publicidade ou
rastreadores de marketing.

## 3. Para que usamos e por que podemos

- **Prestar o serviço** (entender seu texto/áudio/imagem, montar e emitir o
  orçamento, guardar seu histórico): execução do contrato e procedimentos
  preliminares (LGPD, art. 7º, V).
- **Segurança, prevenção de abuso e limite de uso** (por exemplo, limite diário
  de leituras por empresa): legítimo interesse (art. 7º, IX).
- **Monitorar erros e custos** para o app funcionar bem: legítimo interesse
  (art. 7º, IX). Os dados de erro não trazem o conteúdo dos orçamentos.
- **Microfone e câmera:** só são usados quando você toca em "Falar" ou "Foto",
  com a permissão do sistema, que você pode negar ou retirar a qualquer momento
  nas configurações do aparelho (consentimento, art. 7º, I).

## 4. Áudio e imagens: como tratamos

1. Ao gravar ou escolher uma imagem, o arquivo **fica só no seu aparelho**, em
   uma lista de anexos onde você pode ouvir, ver e excluir.
2. **Nada é enviado até você tocar em "Continuar".** Aí o arquivo vai ao nosso
   servidor e, dele, ao fornecedor de inteligência artificial (seção 5), que
   devolve o texto.
3. **Não guardamos o áudio nem as imagens.** Depois de convertidos em texto o
   servidor os descarta. Só o texto que **você confirma** entra no orçamento.
4. Você revisa e corrige o texto antes de o orçamento ser interpretado.

**Atenção:** um print de conversa ou a foto de um bilhete pode conter dados de
outras pessoas. Anexe só o necessário e evite o que não deveria ser
compartilhado.

## 5. Com quem os dados passam (operadores e fornecedores)

Não vendemos seus dados. Para o app funcionar, usamos estes fornecedores:

| Fornecedor | Para quê | O que recebe | Onde |
| --- | --- | --- | --- |
| **Supabase** | banco de dados, login, arquivos (logotipo e PDFs, em pastas privadas) e funções do servidor | todos os dados da conta, empresa, clientes e orçamentos | região de São Paulo (Brasil) |
| **OpenAI** | entender o texto do orçamento; transcrever áudio; ler o texto de imagens | o texto do orçamento; o áudio; as imagens que você anexou | Estados Unidos |
| **Google** | login com sua conta Google | seu e-mail e nome | - |
| **Sentry** | receber relatórios de erro do app e do servidor | mensagem técnica do erro, versão do app, aparelho e o identificador interno da conta (nunca o conteúdo dos orçamentos) | `[PREENCHER: região do projeto no Sentry - EUA ou UE]` |
| **Expo (EAS)** | entregar o aplicativo e suas atualizações | nada do seu conteúdo; só o aparelho pede a atualização | - |

**O que a OpenAI faz com o que recebe** (conforme a documentação oficial da
OpenAI, conferida em 24/09/2026): os dados enviados pela API **não são usados
para treinar** os modelos dela; por padrão, os registros de monitoramento de
abuso podem ser mantidos por **até 30 dias**; a transcrição de áudio não guarda
o conteúdo. Nós pedimos explicitamente para **não armazenar** as respostas
(`store: false`). Como a OpenAI fica nos Estados Unidos, há **transferência
internacional de dados** (LGPD, art. 33), feita apenas para prestar o serviço.

## 6. Por quanto tempo guardamos

- **Enquanto sua conta existir:** empresa, clientes, orçamentos, versões, PDFs
  e logotipo, para você consultar o histórico.
- **Áudio e imagens:** não guardamos (seção 4).
- **Dados técnicos de uso** (custo, tempo, status): enquanto a conta existir; sem
  conteúdo.
- **Quando você exclui a conta** (seção 7): apagamos tudo isso, salvo o que está
  descrito ali como exceção.

## 7. Seus direitos e como exercê-los

Você pode, a qualquer momento, pedir: confirmação de que tratamos seus dados;
acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários;
portabilidade; informação sobre com quem compartilhamos; e revogar
consentimentos (LGPD, art. 18).

- **Corrigir** empresa, clientes e orçamentos: direto no app.
- **Excluir a conta:** em **Perfil > Excluir minha conta**. A conta fica
  **agendada por 7 dias** (nesse prazo você pode cancelar e voltar a usar); depois
  disso apagamos automaticamente a empresa, clientes, orçamentos, PDFs,
  logotipo e o próprio login.
- **Acesso, exportação e demais pedidos:** pelo e-mail
  `[PREENCHER: e-mail]`. `[PREENCHER: prazo de resposta que você se compromete a cumprir, ex.: 15 dias]`.
  Hoje **não há botão de exportação** no app; atendemos por e-mail.

**O que não some imediatamente com a exclusão:**

- **Cópias de segurança** do banco de dados (Supabase): podem reter dados já
  apagados até serem substituídas pelo ciclo normal de backups
  `[PREENCHER: confirmar o prazo de backup do plano do Supabase]`.
- **Relatórios de erro** já enviados ao Sentry (contêm apenas o identificador
  interno, sem conteúdo de orçamento): expiram pelo prazo do próprio Sentry
  `[PREENCHER: retenção configurada no Sentry]`.
- Registros que a lei nos obrigue a manter.

## 8. Segurança

- Cada empresa só acessa os **próprios** dados (regras de isolamento no banco).
- PDFs e logotipos ficam em **pastas privadas**, acessadas por links temporários.
- As chaves dos fornecedores ficam **só no servidor**, nunca no aplicativo.
- A comunicação usa conexão criptografada (HTTPS).
- Nenhum sistema é 100% seguro. Se houver um incidente que possa afetar você,
  avisaremos você e a Autoridade Nacional de Proteção de Dados (ANPD) nos
  termos da lei.

## 9. Sobre a inteligência artificial

O OrçaAI usa IA para **sugerir** um orçamento a partir do que você escreveu,
falou ou fotografou. A IA pode errar ao ouvir ou ler (por isso você confere o
texto e os valores antes de continuar). **Você é responsável por revisar e
confirmar o orçamento antes de emitir ou enviar ao seu cliente.** O orçamento
do OrçaAI **não é documento fiscal**.

## 10. Crianças e adolescentes

O OrçaAI é destinado a pessoas maiores de 18 anos, que exercem atividade
profissional. Não coletamos dados de menores de propósito.

## 11. Versão de teste

Enquanto o app estiver em **teste fechado**, ele pode mudar, ter falhas e
receber ajustes frequentes. Os dados dos testadores seguem esta política.

## 12. Mudanças nesta política

Se algo mudar de forma relevante (por exemplo, um fornecedor novo), atualizamos
este texto e avisamos no app. A data da versão está no topo.

## 13. Contato e reclamações

Dúvidas ou pedidos: `[PREENCHER: e-mail]`. Você também pode reclamar à
Autoridade Nacional de Proteção de Dados (ANPD): <https://www.gov.br/anpd>.
