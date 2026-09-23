import { describe, expect, it } from "vitest";
import { sanitizeBreadcrumb, sanitizeEvent, scrubText, stripUrlQuery } from "./sanitize";

describe("stripUrlQuery", () => {
  it("drops query string and hash, keeps origin and path", () => {
    expect(stripUrlQuery("http://x/rest/v1/customers?name=ilike.*Maria*#a")).toBe("http://x/rest/v1/customers");
  });
});

describe("scrubText", () => {
  it("removes e-mail, phone, CPF and CNPJ", () => {
    const out = scrubText("erro para maria@ex.com tel (11) 98888-0000 cpf 123.456.789-09 cnpj 12.345.678/0001-90");
    expect(out).not.toMatch(/maria@|98888|123\.456|12\.345/);
    expect(out).toContain("[removido]");
  });

  it("truncates long messages", () => {
    expect(scrubText("a".repeat(500)).length).toBeLessThanOrEqual(201);
  });
});

describe("sanitizeBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(sanitizeBreadcrumb({ category: "console", message: "Pintura da dona Maria" })).toBeNull();
  });

  it("strips the query from fetch breadcrumbs and drops unknown data fields", () => {
    const out = sanitizeBreadcrumb({
      category: "fetch",
      data: { url: "http://x/rest/v1/customers?name=ilike.*Maria*", method: "GET", status_code: 200, body: "segredo" },
    });
    expect(out?.data).toEqual({ url: "http://x/rest/v1/customers", method: "GET", status_code: 200 });
  });
});

describe("sanitizeEvent", () => {
  it("keeps only the technical user id and the request method/path", () => {
    const out = sanitizeEvent({
      user: { id: "uuid-1", email: "a@b.com", ip_address: "1.2.3.4", username: "maria" },
      request: { url: "http://x/quote/1?q=texto", method: "POST", data: { source_text: "texto do cliente" }, cookies: "c=1" },
      extra: { source_text: "Pintura da dona Maria" },
    });
    expect(out.user).toEqual({ id: "uuid-1" });
    expect(out.request).toEqual({ url: "http://x/quote/1", method: "POST" });
    expect(out.extra).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/Maria|a@b\.com|1\.2\.3\.4|texto do cliente/);
  });

  it("scrubs exception messages and breadcrumbs", () => {
    const out = sanitizeEvent({
      exception: { values: [{ value: "insert failed for maria@ex.com" }] },
      breadcrumbs: [{ category: "console", message: "x" }, { category: "ui.click", message: "tel (11) 98888-0000" }],
    });
    expect(out.exception?.values?.[0]?.value).not.toContain("maria@");
    expect(out.breadcrumbs).toHaveLength(1);
    expect(out.breadcrumbs?.[0]?.message).not.toContain("98888");
  });
});
