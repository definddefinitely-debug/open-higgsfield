import { describe, expect, it } from "vitest";

import { getModel } from "./index";
import { parseSettings } from "./parse-settings";

/* This runs during render in the composer, and there is no error boundary above
   it. Every case here used to throw, which blanked the whole studio the moment
   localStorage held a value the current catalog no longer lists. */
describe("parseSettings", () => {
  it("falls back to the catalog default for an empty plane", () => {
    const model = getModel("seedance-2.5");
    const out = parseSettings(model, {});
    for (const [key, field] of Object.entries(model.settings)) {
      expect(out[key], key).toBe(field.default);
    }
  });

  it.each([
    ["seedance-2.5", "duration", 45, 30],
    ["seedance-2.5", "duration", 1, 4],
    ["wan-3", "duration", 20, 10],
    ["wan-3", "duration", -3, 4],
    ["kling-3-std", "cfgScale", 1.5, 1],
    ["kling-3-std", "cfgScale", -0.2, 0],
  ])("clamps %s.%s=%s to %s instead of throwing", (id, key, given, expected) => {
    expect(parseSettings(getModel(id), { [key]: given })[key]).toBe(expected);
  });

  it("drops an enum value the model does not list back to its default", () => {
    expect(parseSettings(getModel("soul-2"), { resolution: "4k" }).resolution).toBe("720p");
    expect(parseSettings(getModel("seedance-2.5"), { aspectRatio: "2:1" }).aspectRatio).toBe(
      "16:9",
    );
  });

  it("keeps a legal value exactly as given", () => {
    const out = parseSettings(getModel("seedance-2.5"), { duration: 12, aspectRatio: "21:9" });
    expect(out.duration).toBe(12);
    expect(out.aspectRatio).toBe("21:9");
  });

  it("coerces a wrong-typed value to the default rather than forwarding it", () => {
    const model = getModel("kling-3-std");
    const out = parseSettings(model, { sound: "yes", multiShots: 1, duration: "5" });
    expect(out.sound).toBe(true); /* default for sound */
    expect(out.multiShots).toBe(false);
    expect(out.duration).toBe(5);
  });

  it("never emits a key the model does not declare", () => {
    const model = getModel("wan-3");
    const out = parseSettings(model, { duration: 7, injected: "evil", aspectRatio: "16:9" });
    expect(Object.keys(out).sort()).toEqual(Object.keys(model.settings).sort());
  });

  /* A non-finite number is not a number the slider can hold, so it resolves to
     the default rather than being clamped onto either end. */
  it("falls back to the default for NaN and Infinity on a range", () => {
    const model = getModel("wan-3");
    expect(parseSettings(model, { duration: Number.NaN }).duration).toBe(5);
    expect(parseSettings(model, { duration: Number.POSITIVE_INFINITY }).duration).toBe(5);
    expect(parseSettings(model, { duration: Number.NEGATIVE_INFINITY }).duration).toBe(5);
  });
});
