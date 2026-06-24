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
    expect(categoryForExtension("html")).toBe("html");
    expect(categoryForExtension("htm")).toBe("html");
  });
  it("normalizeAllowedTypes", () => {
    expect(normalizeAllowedTypes("*")).toBe("*");
    expect(normalizeAllowedTypes("video,image,image")).toBe("image,video");
    expect(normalizeAllowedTypes("bogus")).toBe("*");
    expect(normalizeAllowedTypes("")).toBe("*");
    expect(normalizeAllowedTypes("html,image")).toBe("html,image");
    expect(normalizeAllowedTypes("image,video,other")).toBe("image,other,video");
  });
  it("isTypeAllowed honors policy", () => {
    expect(isTypeAllowed("a.png", "*")).toBe(true);
    expect(isTypeAllowed("a.png", "image")).toBe(true);
    expect(isTypeAllowed("a.mp4", "image")).toBe(false);
    expect(isTypeAllowed("a.pdf", "image,video")).toBe(false);
    expect(isTypeAllowed("a.pdf", "other")).toBe(true);
  });
  it("html is gated as its own type", () => {
    expect(isTypeAllowed("x.html", "*")).toBe(true);            // full access includes html
    expect(isTypeAllowed("x.html", "html")).toBe(true);         // explicit html grant
    expect(isTypeAllowed("x.htm", "image,video,other")).toBe(false); // not granted → blocked
    expect(isTypeAllowed("x.html", "image")).toBe(false);
    expect(isTypeAllowed("a.png", "html")).toBe(false);         // html grant ≠ image grant
  });
});
