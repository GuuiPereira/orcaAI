import { describe, expect, it } from "vitest";
import { buildPrivacyPolicyMarkdown, isPrivacyPolicyComplete, PRIVACY_POLICY_VERSION } from "./privacy-policy";

const filled = {
  controllerName: "Fulano de Tal",
  controllerDocument: "12.345.678/0001-90",
  privacyEmail: "privacidade@orcaai.com.br",
  responseDays: 15,
};

describe("privacy policy template", () => {
  it("fills the controller, document, e-mail and response time", () => {
    const text = buildPrivacyPolicyMarkdown(filled);
    expect(text).toContain("**Responsável pelo aplicativo:** Fulano de Tal (12.345.678/0001-90)");
    expect(text).toContain("privacidade@orcaai.com.br");
    expect(text).toContain("em até **15 dias**");
    expect(text).toContain(`Versão ${PRIVACY_POLICY_VERSION}`);
    expect(text).not.toContain("(a definir)");
  });

  it("leaves the document out when it is not given (CPF is optional)", () => {
    const text = buildPrivacyPolicyMarkdown({ ...filled, controllerDocument: null });
    expect(text).toContain("**Responsável pelo aplicativo:** Fulano de Tal\n");
  });

  it("marks missing controller data as '(a definir)' instead of inventing it", () => {
    const text = buildPrivacyPolicyMarkdown({ controllerName: null, controllerDocument: null, privacyEmail: " ", responseDays: null });
    expect(text).toContain("**Responsável pelo aplicativo:** (a definir)");
    expect(text).toContain("no prazo (a definir)");
  });

  it("has no leftover [PREENCHER] markers and states the checked technical facts", () => {
    const text = buildPrivacyPolicyMarkdown(filled);
    expect(text).not.toMatch(/PREENCHER/);
    expect(text).toContain("**Sentry** (Estados Unidos)");
    expect(text).toContain("Grafana Cloud** (Brasil, São Paulo)");
    expect(text).toContain("expiram em até **30 dias**");
    expect(text).toContain("**não mantém cópias de segurança\nautomáticas**");
  });

  it("is complete only with name, e-mail and response time", () => {
    expect(isPrivacyPolicyComplete(filled)).toBe(true);
    expect(isPrivacyPolicyComplete({ ...filled, controllerDocument: null })).toBe(true);
    expect(isPrivacyPolicyComplete({ ...filled, privacyEmail: null })).toBe(false);
    expect(isPrivacyPolicyComplete({ ...filled, responseDays: null })).toBe(false);
    expect(isPrivacyPolicyComplete({ ...filled, controllerName: "  " })).toBe(false);
  });
});
