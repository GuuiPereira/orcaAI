// Fora de src/ de propósito: lê arquivo do disco (node:fs) e o tsc do pacote
// só olha src/ (sem @types/node). O Vitest roda mesmo assim.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPrivacyPolicyDoc } from "../src/legal/privacy-policy-doc.ts";

describe("docs/POLITICA_DE_PRIVACIDADE.md", () => {
  it("is in sync with the template the app shows (run `pnpm --filter @orcaai/shared run gen:privacy`)", () => {
    const doc = readFileSync(fileURLToPath(new URL("../../../docs/POLITICA_DE_PRIVACIDADE.md", import.meta.url)), "utf8");
    expect(doc).toBe(buildPrivacyPolicyDoc());
  });
});
