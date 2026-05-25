import { describe, it, expect } from "vitest";
import { getDomainGroup } from "../../src/services/domain-groups.js";

describe("getDomainGroup", () => {
  it("classifies gmail.com as Google", () => {
    expect(getDomainGroup("gmail.com")).toBe("Google");
  });

  it("classifies outlook.com as Microsoft", () => {
    expect(getDomainGroup("outlook.com")).toBe("Microsoft");
  });

  it("classifies hotmail.de as Microsoft", () => {
    expect(getDomainGroup("hotmail.de")).toBe("Microsoft");
  });

  it("classifies yahoo.com as Yahoo", () => {
    expect(getDomainGroup("yahoo.com")).toBe("Yahoo");
  });

  it("classifies gmx.de as German", () => {
    expect(getDomainGroup("gmx.de")).toBe("German");
  });

  it("classifies wp.pl as Polish", () => {
    expect(getDomainGroup("wp.pl")).toBe("Polish");
  });

  it("classifies qq.com as Asian", () => {
    expect(getDomainGroup("qq.com")).toBe("Asian");
  });

  it("classifies comcast.net as ISP", () => {
    expect(getDomainGroup("comcast.net")).toBe("ISP");
  });

  it("classifies icloud.com as Apple", () => {
    expect(getDomainGroup("icloud.com")).toBe("Apple");
  });

  it("returns Unknown for unrecognized domain", () => {
    expect(getDomainGroup("random-domain.xyz")).toBe("Unknown");
  });

  it("is case-insensitive", () => {
    expect(getDomainGroup("GMAIL.COM")).toBe("Google");
  });
});
