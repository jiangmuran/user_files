import { describe, it, expect } from "vitest";
import { extensionOf, categoryForExtension, normalizeAllowedTypes, isTypeAllowed } from "../../src/auth/filetypes.js";

describe("filetypes", () => {
  it("extensionOf", () => {
    expect(extensionOf("a.PNG")).toBe("png");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("noext")).toBe("");
  });
  it("categoryForExtension", () => {
    expect(categoryForExtension("jpg")).toBe("image");
    expect(categoryForExtension("mp4")).toBe("video");
    expect(categoryForExtension("pdf")).toBe("other");
  });
  it("normalizeAllowedTypes", () => {
    expect(normalizeAllowedTypes("*")).toBe("*");
    expect(normalizeAllowedTypes("video,image,image")).toBe("image,video");
    expect(normalizeAllowedTypes("bogus")).toBe("*");
    expect(normalizeAllowedTypes("")).toBe("*");
  });
  it("isTypeAllowed honors policy", () => {
    expect(isTypeAllowed("a.png", "*")).toBe(true);
    expect(isTypeAllowed("a.png", "image")).toBe(true);
    expect(isTypeAllowed("a.mp4", "image")).toBe(false);
    expect(isTypeAllowed("a.pdf", "image,video")).toBe(false);
    expect(isTypeAllowed("a.pdf", "other")).toBe(true);
  });
});
