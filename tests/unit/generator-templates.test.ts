import { describe, it, expect } from "vitest";
import { applyTemplate } from "../../src/services/generator/templates.js";

const params = {
  firstName: "Max",
  lastName: "Mueller",
  city: "Berlin",
  birthYear: "1995",
};
const domain = "gmx.de";

describe("applyTemplate", () => {
  it("full → name.surname@domain", () => {
    expect(applyTemplate("full", params, domain)).toBe("max.mueller@gmx.de");
  });

  it("first_sur → nsurname@domain", () => {
    expect(applyTemplate("first_sur", params, domain)).toBe("mmueller@gmx.de");
  });

  it("name_num → name+YY@domain", () => {
    expect(applyTemplate("name_num", params, domain)).toBe("max95@gmx.de");
  });

  it("sur_name → surname.name@domain", () => {
    expect(applyTemplate("sur_name", params, domain)).toBe("mueller.max@gmx.de");
  });

  it("name_city → name.city@domain", () => {
    expect(applyTemplate("name_city", params, domain)).toBe("max.berlin@gmx.de");
  });

  it("full_year → name.surname+YY@domain", () => {
    expect(applyTemplate("full_year", params, domain)).toBe("max.mueller95@gmx.de");
  });

  it("first_sur_num → nsurname+YY@domain", () => {
    expect(applyTemplate("first_sur_num", params, domain)).toBe("mmueller95@gmx.de");
  });

  it("underscore → name_surname@domain", () => {
    expect(applyTemplate("underscore", params, domain)).toBe("max_mueller@gmx.de");
  });

  it("concat → namesurname@domain", () => {
    expect(applyTemplate("concat", params, domain)).toBe("maxmueller@gmx.de");
  });
});
