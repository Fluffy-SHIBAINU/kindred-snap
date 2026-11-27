import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/snap/SiteFooter";

describe("SiteFooter", () => {
  const html = renderToStaticMarkup(createElement(SiteFooter));
  it("carries the disclaimer, the Kindred AI link and the atlas credit", () => {
    expect(html).toContain("Not legal or medical advice. The hospital or the program decides.");
    expect(html).toContain('href="https://kindred-ai.dev/"');
    expect(html).toContain('href="https://kindred-ai.dev/#contact"');
    expect(html).toContain("Policy data: Waive atlas, CC BY 4.0.");
  });
  it("no longer links the staff workspace", () => {
    expect(html).not.toContain("Staff workspace");
    expect(html).not.toContain("/staff");
  });
});
