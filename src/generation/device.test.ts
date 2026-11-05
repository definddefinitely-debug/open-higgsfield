import { describe, expect, it } from "vitest";

import { blobPathname, mintDeviceId, parseDeviceId, resolveDeviceId } from "./device";

/* These paths are handed straight to Vercel Blob under the operator's
   read-write token, so a crafted filename must not be able to escape the
   device's own prefix. */
describe("blobPathname", () => {
  const device = "a".repeat(32);

  it("prefixes the device id", () => {
    expect(blobPathname(device, "photo.png")).toBe(`${device}/photo.png`);
  });

  it.each([
    /* Only the last path segment survives, so a traversal collapses to the
       file's own name before any character is rewritten. */
    ["../../etc/passwd", "passwd"],
    ["..\\..\\windows\\system32", "system32"],
    ["/absolute/path.png", "path.png"],
    ["....//....//x.png", "x.png"],
    /* Each run of disallowed characters collapses to a single underscore. */
    ["..%2f..%2fescaped.png", "_2f.._2fescaped.png"],
    ["spaced name (1).png", "spaced_name_1_.png"],
    ["ünïcödé.png", "_n_c_d_.png"],
    /* A dotfile loses its leading dots so it cannot hide from a listing. */
    [".hidden", "hidden"],
    ["...leading-dots.png", "leading-dots.png"],
    ["", "file"],
    ["///", "file"],
  ])("sanitises %j to %j", (input, expected) => {
    expect(blobPathname(device, input)).toBe(`${device}/${expected}`);
  });

  it("never yields a segment that walks up", () => {
    for (const name of ["../../x", "..\\..\\x", "a/../../x", "%2e%2e%2fx"]) {
      const path = blobPathname(device, name);
      expect(path).not.toContain("..");
      expect(path.startsWith(`${device}/`)).toBe(true);
    }
  });

  it("caps the filename so a long name cannot exceed the store's limit", () => {
    const path = blobPathname(device, `${"n".repeat(500)}.png`);
    expect(path.length).toBeLessThanOrEqual(device.length + 1 + 180);
  });

  it("refuses a device id it did not mint", () => {
    expect(() => blobPathname("short", "a.png")).toThrowError("Invalid device id");
    expect(() => blobPathname("../escape", "a.png")).toThrowError("Invalid device id");
    expect(() => blobPathname("", "a.png")).toThrowError("Invalid device id");
  });
});

describe("device ids", () => {
  it("mints an id that satisfies its own parser", () => {
    const id = mintDeviceId();
    expect(parseDeviceId(id)).toBe(id);
    expect(id).toHaveLength(32);
  });

  it("mints a different id every time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintDeviceId()));
    expect(ids.size).toBe(50);
  });

  it("accepts only the 16-to-64 URL-safe alphabet", () => {
    expect(parseDeviceId("a".repeat(16))).not.toBeNull();
    expect(parseDeviceId("a".repeat(64))).not.toBeNull();
    expect(parseDeviceId("a".repeat(15))).toBeNull();
    expect(parseDeviceId("a".repeat(65))).toBeNull();
    expect(parseDeviceId("a".repeat(16) + "/")).toBeNull();
    expect(parseDeviceId(`${"a".repeat(16)}+`)).toBeNull();
    expect(parseDeviceId(undefined)).toBeNull();
    expect(parseDeviceId("")).toBeNull();
  });

  it("reuses a valid cookie and only mints when it has to", () => {
    const existing = "b".repeat(20);
    expect(resolveDeviceId(existing)).toEqual({ deviceId: existing, minted: false });
    const fresh = resolveDeviceId("bad id!");
    expect(fresh.minted).toBe(true);
    expect(parseDeviceId(fresh.deviceId)).toBe(fresh.deviceId);
  });
});
