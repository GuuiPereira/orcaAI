// Regenera docs/POLITICA_DE_PRIVACIDADE.md a partir do template da política
// (packages/shared/src/legal/privacy-policy.ts).
// Uso: pnpm --filter @orcaai/shared run gen:privacy
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPrivacyPolicyDoc } from "../src/legal/privacy-policy-doc.ts";

const target = fileURLToPath(new URL("../../../docs/POLITICA_DE_PRIVACIDADE.md", import.meta.url));
writeFileSync(target, buildPrivacyPolicyDoc());
console.log(`gerado: ${target}`);
