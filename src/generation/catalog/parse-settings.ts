import type { ModelEntry } from "./types";

/** Resolve one model's settings against its catalog declaration.

    Values arrive from localStorage and from history records, both of which
    outlive the catalog revision that wrote them: a range narrowed in a later
    release leaves a stored number outside it. Every out-of-catalog value
    therefore resolves to the nearest legal one rather than throwing — this
    runs during render in the composer, and a throw there blanks the whole
    studio with no error boundary to catch it.

    The guarantee the server relies on still holds: no value reaches the
    platform that the catalog does not list. */
export function parseSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    const value = raw[key];
    if (field.type === "enum") {
      out[key] =
        typeof value === "string" && field.values.includes(value) ? value : field.default;
      continue;
    }
    if (field.type === "range") {
      const picked = typeof value === "number" && Number.isFinite(value) ? value : field.default;
      out[key] = Math.min(field.max, Math.max(field.min, picked));
      continue;
    }
    out[key] = typeof value === "boolean" ? value : field.default;
  }
  return out;
}
