import { describe, expect, it } from "vitest";

import {
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
  toAuthorizationHeader,
} from "./credentials";

describe("credentials round-trip", () => {
  it("survives encode then decode", () => {
    expect(decodeCredentials(encodeCredentials("id:secret"))).toEqual({ apiKey: "id:secret" });
  });

  it("trims surrounding whitespace on the way in", () => {
    expect(parseCredentialInput({ apiKey: "  id:secret  " })).toEqual({ apiKey: "id:secret" });
  });

  it("accepts either casing of the field the client may send", () => {
    expect(parseCredentialInput({ apiKey: "id:secret" })).toEqual({ apiKey: "id:secret" });
    expect(parseCredentialInput({ api_key: "id:secret" })).toEqual({ apiKey: "id:secret" });
  });
});

describe("credentials rejection", () => {
  it.each([
    ["no colon", "idsecret"],
    ["a leading colon", ":secret"],
    ["a trailing colon", "id:"],
  ])("rejects a key with %s", (_why, apiKey) => {
    expect(() => parseCredentialInput({ apiKey })).toThrowError("API key must be id:secret");
    expect(() => toAuthorizationHeader(apiKey)).toThrowError("API key must be id:secret");
  });

  /* An empty field is caught before the shape check, so it reads as "enter a
     key" rather than "that key is malformed". */
  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("rejects %s as a missing key", (_why, apiKey) => {
    expect(() => parseCredentialInput({ apiKey })).toThrowError("Enter an API key");
  });

  it.each([
    ["null", null],
    ["a string", "id:secret"],
    ["an array", ["id:secret"]],
    ["an empty object", {}],
  ])("rejects a payload that is %s", (_why, payload) => {
    expect(() => parseCredentialInput(payload)).toThrowError("Enter an API key");
  });

  /* A cookie is attacker-shaped input: decode must fail closed, never throw,
     because it runs on every request that reads stored credentials. */
  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["not json", "id:secret"],
    ["a json array", "[1,2,3]"],
    ["a json string", '"id:secret"'],
    ["an object without apiKey", '{"other":"x"}'],
    ["an object with a non-string key", '{"apiKey":42}'],
    ["an object with a malformed key", '{"apiKey":"nosecret"}'],
    ["truncated json", '{"apiKey":"id:sec'],
  ])("decodes %s to null rather than throwing", (_why, raw) => {
    expect(decodeCredentials(raw as string | undefined)).toBeNull();
  });
});

describe("cookie contract", () => {
  it("is httpOnly and sameSite=lax so the key never reaches script", () => {
    expect(PLATFORM_KEY_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(PLATFORM_KEY_COOKIE_OPTIONS.sameSite).toBe("lax");
    expect(PLATFORM_KEY_COOKIE_OPTIONS.path).toBe("/");
  });

  it("names the cookie the studio reads back", () => {
    expect(PLATFORM_KEY_COOKIE).toBe("api_key");
  });

  it("has a distinct missing-credentials error the UI can branch on", () => {
    const error = new MissingCredentialsError();
    expect(error.name).toBe("MissingCredentialsError");
    expect(error).toBeInstanceOf(Error);
  });

  it("builds the header the platform expects", () => {
    expect(toAuthorizationHeader("id:secret")).toBe("Key id:secret");
  });
});
