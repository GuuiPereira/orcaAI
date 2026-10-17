import { buildPrivacyPolicyMarkdown } from "./privacy-policy.ts";

// Conteúdo de docs/POLITICA_DE_PRIVACIDADE.md: o mesmo texto do app, com os
// campos do painel admin no lugar dos valores. Gerado por
// scripts/gen-privacy-policy.ts; tests/privacy-policy-doc.test.ts falha se o
// arquivo do doc estiver diferente disto.
export function buildPrivacyPolicyDoc(): string {
  const body = buildPrivacyPolicyMarkdown({
    controllerName: "`[painel admin: nome ou razão social]`",
    controllerDocument: "`[painel admin: CPF/CNPJ - opcional]`",
    privacyEmail: "`[painel admin: e-mail de privacidade]`",
    responseDays: null,
  }).replace("no prazo (a definir)", "no prazo `[painel admin: prazo de resposta, em dias]`");

  return `<!-- GERADO a partir de packages/shared/src/legal/privacy-policy.ts - não edite à mão.
     Para mudar o texto: edite o template, suba PRIVACY_POLICY_VERSION e rode
     \`pnpm --filter @orcaai/shared run gen:privacy\`. -->

> **Sobre este arquivo:** é a cópia legível da política que o app mostra
> (tela "Política de privacidade", aberta no login e em Perfil > Ajuda). Os
> campos \`[painel admin: ...]\` são preenchidos pelo administrador no painel
> admin ("Política de privacidade" > Editar) e aparecem no app na hora. Os
> fatos técnicos (regiões, prazos de retenção, backups) foram conferidos em
> 17/10/2026 - ver o comentário no topo do template. **Não substitui revisão
> jurídica**: para o teste fechado com pessoas conhecidas cumpre o papel de
> transparência; antes de abrir ao público ou cobrar, um advogado deve revisar
> (ver \`docs/ROADMAP.md\`, Fase 3).

${body}`;
}
