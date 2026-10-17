// Política de privacidade - FONTE ÚNICA do texto. O app mostra este texto
// (tela "Política de privacidade") e `docs/POLITICA_DE_PRIVACIDADE.md` é gerado
// a partir dele (`pnpm --filter @orcaai/shared run gen:privacy`); um teste
// falha se os dois divergirem.
//
// Os dados do responsável (nome, documento, e-mail, prazo) vêm do painel
// admin (`privacy_settings`); o resto são fatos conferidos em 17/10/2026 - se
// algum mudar, mude aqui, suba a versão e regenere o doc:
// - Supabase no plano Free: SEM cópias de segurança automáticas (se passar pro
//   Pro, backups diários guardados por 7 dias - reescrever a seção 7);
// - Sentry no plano Developer, região EUA: eventos guardados por 30 dias;
// - Grafana Cloud com a stack em São Paulo;
// - OpenAI: sem treino com dados da API, até 30 dias de log de abuso,
//   `store: false` nas nossas chamadas.

export const PRIVACY_POLICY_VERSION = "0.3";
export const PRIVACY_POLICY_UPDATED_AT = "17/10/2026";

export type PrivacyPolicyValues = {
  controllerName: string | null;
  // CPF/CNPJ é opcional: a LGPD pede a identificação e o contato do
  // controlador, não a publicação do CPF de uma pessoa física.
  controllerDocument: string | null;
  privacyEmail: string | null;
  responseDays: number | null;
};

const MISSING = "(a definir)";

// Completa = dá pra mostrar aos testadores sem "(a definir)" no texto.
export function isPrivacyPolicyComplete(values: PrivacyPolicyValues): boolean {
  return Boolean(values.controllerName?.trim() && values.privacyEmail?.trim() && values.responseDays);
}

function fill(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : MISSING;
}

export function buildPrivacyPolicyMarkdown(values: PrivacyPolicyValues): string {
  const controller = values.controllerDocument?.trim()
    ? `${fill(values.controllerName)} (${values.controllerDocument.trim()})`
    : fill(values.controllerName);
  const email = fill(values.privacyEmail);
  const responseTime = values.responseDays ? `em até **${values.responseDays} dias**` : `no prazo ${MISSING}`;

  return `# Política de Privacidade do OrçaAI

**Versão ${PRIVACY_POLICY_VERSION} - ${PRIVACY_POLICY_UPDATED_AT}**

Esta política explica, em linguagem simples, quais dados o OrçaAI usa, para
quê, com quem passam por ali e como você exerce seus direitos, conforme a Lei
Geral de Proteção de Dados (LGPD - Lei 13.709/2018).

## 1. Quem é o responsável

O OrçaAI é um aplicativo que ajuda prestadores de serviço a montar orçamentos
a partir de um texto, um áudio ou uma imagem.

- **Responsável pelo aplicativo:** ${controller}
- **Contato para assuntos de privacidade:** ${email}

Existem dois papéis diferentes:

- **Seus dados** (sua conta e os dados da sua empresa): o OrçaAI é o
  **controlador** - decide para que usá-los.
- **Dados dos seus clientes** que você digita ou fotografa para montar um
  orçamento (nome, telefone, endereço...): **você** é o controlador, porque
  decide para quem e por que orçar; o OrçaAI atua como **operador**, tratando
  esses dados só para prestar o serviço que você pediu. Use apenas dados que
  você tem o direito de usar para esse fim.

## 2. Quais dados coletamos

- **Conta:** nome e e-mail da sua conta Google; telefone, se você informar
  (vêm do login com Google e do seu perfil).
- **Sua empresa:** nome fantasia, razão social, CPF/CNPJ, telefone, e-mail,
  endereço, logotipo e condições comerciais padrão (você preenche no Perfil).
- **Seus clientes:** nome, telefone, e-mail, documento, endereço e
  observações (você cadastra ou escreve no orçamento).
- **Orçamentos:** o texto original, os itens e valores, local do serviço,
  condições, versões emitidas e o PDF gerado.
- **Áudio e imagens:** o áudio que você grava e as fotos/prints que anexa
  (ver seção 4).
- **Uso técnico, sem o conteúdo:** para cada leitura de áudio/imagem: tipo,
  duração ou nº de imagens, tamanho, modelo usado, custo estimado, tempo e se
  deu certo. Para cada interpretação: status, versão do modelo, custo, tempo
  e quem pediu. Na emissão: quantos itens/campos você mudou em relação à
  sugestão da IA (só a contagem). Quando você compartilha um PDF: só o fato e
  a hora.
- **Plano:** seu plano (Gratuito ou Profissional), a validade e quando foi
  ativado. O pagamento, nesta fase, é combinado **fora do app** (ex.: Pix) - o
  app não recebe dados de cartão ou de conta bancária.
- **Erros do app, sem o conteúdo dos seus orçamentos:** mensagem técnica do
  erro, versão do app, modelo/sistema do aparelho e o identificador interno
  da sua conta, enviados automaticamente quando algo quebra.
- **No seu aparelho:** a sessão de login e os rascunhos que você está
  escrevendo - ficam só no aparelho.

Não coletamos localização, contatos do telefone, nem usamos publicidade ou
rastreadores de marketing.

## 3. Para que usamos e por que podemos

- **Prestar o serviço** (entender seu texto/áudio/imagem, montar e emitir o
  orçamento, guardar seu histórico): execução do contrato e procedimentos
  preliminares (LGPD, art. 7º, V).
- **Segurança, prevenção de abuso e limite de uso** (por exemplo, limite diário
  de uso da IA por empresa e, em caso de uso indevido, suspensão da conta -
  sem apagar seus dados): legítimo interesse (art. 7º, IX).
- **Aplicar o seu plano** (limite de orçamentos do Gratuito, recursos do
  Profissional): execução do contrato (art. 7º, V).
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

- **Supabase** (Brasil, São Paulo): banco de dados, login, arquivos (logotipo
  e PDFs, em pastas privadas) e funções do servidor. Recebe todos os dados da
  conta, da empresa, dos clientes e dos orçamentos.
- **OpenAI** (Estados Unidos): entender o texto do orçamento, transcrever
  áudio e ler o texto de imagens. Recebe o texto do orçamento, o áudio e as
  imagens que você anexou.
- **Google:** login com sua conta Google. Recebe seu e-mail e nome.
- **Sentry** (Estados Unidos): relatórios de erro do app e do servidor.
  Recebe a mensagem técnica do erro, a versão do app, o aparelho e o
  identificador interno da conta - nunca o conteúdo dos orçamentos.
- **Expo (EAS):** entregar o aplicativo e suas atualizações. Não recebe nada
  do seu conteúdo; só o aparelho pede a atualização.
- **Grafana Labs - Grafana Cloud** (Brasil, São Paulo): painel de métricas de
  operação usado pela equipe do OrçaAI. Recebe só números (contagens, custos
  estimados, tempos), o identificador interno e o **nome comercial** da sua
  empresa - nunca orçamentos, clientes ou textos. O Grafana consulta esses
  números no nosso banco com um acesso só de leitura.

**O que a OpenAI faz com o que recebe** (conforme a documentação oficial da
OpenAI): os dados enviados pela API **não são usados para treinar** os modelos
dela; por padrão, os registros de monitoramento de abuso podem ser mantidos por
**até 30 dias**; a transcrição de áudio não guarda o conteúdo. Nós pedimos
explicitamente para **não armazenar** as respostas. Como a OpenAI e o Sentry
ficam nos Estados Unidos, há **transferência internacional de dados** (LGPD,
art. 33), feita apenas para prestar o serviço.

## 6. Por quanto tempo guardamos

- **Enquanto sua conta existir:** empresa, clientes, orçamentos, versões, PDFs
  e logotipo, para você consultar o histórico.
- **Áudio e imagens:** não guardamos (seção 4).
- **Dados técnicos de uso** (custo, tempo, status): enquanto a conta existir;
  sem conteúdo.
- **Quando você exclui a conta** (seção 7): apagamos tudo isso, salvo o que está
  descrito ali como exceção.

## 7. Seus direitos e como exercê-los

Você pode, a qualquer momento, pedir: confirmação de que tratamos seus dados;
acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários;
portabilidade; informação sobre com quem compartilhamos; e revogar
consentimentos (LGPD, art. 18).

- **Corrigir** empresa, clientes e orçamentos: direto no app.
- **Excluir a conta:** em **Perfil > Excluir minha conta**. A conta fica
  **agendada por 7 dias** (nesse prazo você pode cancelar e voltar a usar);
  depois disso apagamos automaticamente a empresa, clientes, orçamentos, PDFs,
  logotipo e o próprio login.
- **Acesso, exportação e demais pedidos:** pelo suporte em **Perfil > Ajuda**
  no app ou pelo e-mail ${email}. Respondemos ${responseTime}. Hoje **não há
  botão de exportação** no app; atendemos pelo suporte.

**O que não some imediatamente com a exclusão:**

- **Relatórios de erro** já enviados ao Sentry (contêm apenas o identificador
  interno, sem conteúdo de orçamento): expiram em até **30 dias**.
- **Registros de abuso da OpenAI**, se houver: até 30 dias, pela política da
  própria OpenAI.
- Registros que a lei nos obrigue a manter.

O plano atual do nosso banco de dados **não mantém cópias de segurança
automáticas**: o que é apagado sai de vez. Se isso mudar, esta política será
atualizada com o prazo das cópias.

## 8. Segurança

- Cada empresa só acessa os **próprios** dados (regras de isolamento no banco).
- PDFs e logotipos ficam em **pastas privadas**, acessadas por links temporários.
- As chaves dos fornecedores ficam **só no servidor**, nunca no aplicativo.
- A equipe do OrçaAI, no painel de administração, vê **só números e estados**
  da sua conta (uso, plano, limites, erros por código) - **nunca** o conteúdo
  dos orçamentos, dos clientes ou dos textos. Toda ação do administrador na
  sua conta (mudar plano ou limite, suspender) fica registrada com o motivo.
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

Dúvidas ou pedidos: pelo suporte em **Perfil > Ajuda** no app ou pelo e-mail
${email}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados
(ANPD): https://www.gov.br/anpd
`;
}
