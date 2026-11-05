import { describe, expect, it } from "vitest";

import { t2v } from "./defaults";
import { MODELS, getModel } from "./index";
import { parseSettings } from "./parse-settings";
import type { GenerationPlane, MediaItem, MediaRole, ModelEntry } from "./types";

/** Media keys any mapper can put on the wire. */
const MEDIA_KEYS = [
  "image_url",
  "image_urls",
  "end_image_url",
  "last_image_url",
  "first_frame_url",
  "last_frame_url",
  "video_url",
  "video_urls",
  "audio_urls",
] as const;

/** Endpoints whose name promises media the request must therefore carry. */
const MEDIA_PATH =
  /image-to-video|first-last-frame|reference-to-video|video-edit|video-extend|image-to-image/;

function plane(model: ModelEntry, roles: MediaRole[] = []): GenerationPlane {
  const media: Partial<Record<MediaRole, MediaItem[]>> = {};
  for (const role of roles) {
    media[role] = [{ id: `${role}-0`, url: `https://cdn.test/${role}-0.png`, role }];
  }
  return {
    model: model.id,
    prompt: { text: "a lighthouse in heavy swell" },
    media,
    settings: parseSettings(model, {}),
  };
}

function mediaOnTheWire(body: Record<string, unknown>): string[] {
  return MEDIA_KEYS.filter((key) => key in body);
}

describe("catalog shape", () => {
  it("carries the 38 models the README claims, 8 image and 30 video", () => {
    expect(MODELS).toHaveLength(38);
    expect(MODELS.filter((m) => m.surface === "image")).toHaveLength(8);
    expect(MODELS.filter((m) => m.surface === "video")).toHaveLength(30);
  });

  it("gives every model a unique id and label", () => {
    const ids = MODELS.map((m) => m.id);
    const labels = MODELS.map((m) => m.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("declares every setting default inside its own allow-list", () => {
    for (const model of MODELS) {
      for (const [key, field] of Object.entries(model.settings)) {
        if (field.type === "enum") {
          expect(field.values, `${model.id}.${key}`).toContain(field.default);
        } else if (field.type === "range") {
          expect(field.default, `${model.id}.${key}`).toBeGreaterThanOrEqual(field.min);
          expect(field.default, `${model.id}.${key}`).toBeLessThanOrEqual(field.max);
        }
      }
    }
  });

  it("only ever requires a role the model actually declares", () => {
    for (const model of MODELS) {
      for (const role of model.required ?? []) {
        expect(model.roles[role], `${model.id} requires ${role}`).toBeGreaterThan(0);
      }
    }
  });

  it("has no model that is neither custom-mapped nor path-declared", () => {
    /* toPlatform resolves a custom mapper or falls back to `paths`; a model with
       neither throws at submit time, long after the picker offered it. */
    const mappable = MODELS.filter((m) => m.paths || KNOWN_CUSTOM.has(m.id));
    expect(mappable.map((m) => m.id).sort()).toEqual(MODELS.map((m) => m.id).sort());
  });
});

/** The ids with a bespoke mapper in to-platform.ts. */
const KNOWN_CUSTOM = new Set([
  "soul-cinema",
  "soul-2",
  "kling-3-turbo",
  "kling-3-std",
  "kling-3-pro",
  "kling-3-4k",
  "kling-3-motion-std",
  "kling-3-motion-pro",
  "seedance-2",
  "seedance-2-fast",
  "seedance-2-mini",
  "seedance-2.5",
  "seedance-2.5-edit",
  "seedance-2.5-extend",
]);

describe("toPlatform — required inputs", () => {
  it("refuses every model whose endpoint cannot run without an input it lacks", async () => {
    const { toPlatform } = await import("../to-platform");
    const guarded = MODELS.filter((m) => m.required?.length);
    /* Nine endpoints exist to take a specific input. */
    expect(guarded.map((m) => m.id).sort()).toEqual(
      [
        "dop",
        "grok-imagine-video-1.5",
        "kling-2.5",
        "kling-3-motion-pro",
        "kling-3-motion-std",
        "kling-o1",
        "kling-o3",
        "seedance-2.5-edit",
        "seedance-2.5-extend",
      ].sort(),
    );
    for (const model of guarded) {
      expect(() => toPlatform(plane(model)), model.id).toThrowError(model.label);
    }
  });

  it("lets each guarded model through once its required role is filled", async () => {
    const { toPlatform } = await import("../to-platform");
    for (const model of MODELS.filter((m) => m.required?.length)) {
      const mapped = toPlatform(plane(model, [...model.required!]));
      expect(mediaOnTheWire(mapped.body), model.id).not.toHaveLength(0);
    }
  });

  it("never routes an empty plane onto a media-named endpoint", async () => {
    const { toPlatform } = await import("../to-platform");
    for (const model of MODELS) {
      let path: string;
      let body: Record<string, unknown>;
      try {
        ({ path, body } = toPlatform(plane(model)));
      } catch {
        continue; /* a guarded model that refused is the correct outcome */
      }
      if (!MEDIA_PATH.test(path)) continue;
      expect(mediaOnTheWire(body), `${model.id} -> ${path}`).not.toHaveLength(0);
    }
  });
});

describe("toPlatform — regressions", () => {
  /* LTX ships `.../text-to-video/fast`. t2v() used to anchor its swap to the end
     of the string, so the image sibling was never derived, the mapper fell back
     to the text endpoint, and an attached start frame was silently dropped. */
  it.each(["ltx-2.5-fast", "ltx-2.5-pro"])(
    "%s sends an attached start frame instead of dropping it",
    async (id) => {
      const { toPlatform } = await import("../to-platform");
      const model = getModel(id);
      expect(model.paths?.image, `${id} must derive an image endpoint`).toBeDefined();

      const { path, body } = toPlatform(plane(model, ["start"]));
      expect(path).toBe(model.paths!.image);
      expect(body.image_url).toBe("https://cdn.test/start-0.png");
    },
  );

  it("keeps the derived image endpoint a sibling of the text one", () => {
    expect(t2v("wan/v2.6/text-to-video")).toEqual({
      text: "wan/v2.6/text-to-video",
      image: "wan/v2.6/image-to-video",
    });
    /* The variant segment survives the swap. */
    expect(t2v("lightricks/ltx-2.5/text-to-video/fast")).toEqual({
      text: "lightricks/ltx-2.5/text-to-video/fast",
      image: "lightricks/ltx-2.5/image-to-video/fast",
    });
    /* A path with no text-to-video segment has no sibling to derive. */
    expect(t2v("flux-2-pro")).toEqual({ text: "flux-2-pro" });
  });

  it("maps Soul onto its two bespoke paths with a numeric batch size", async () => {
    const { toPlatform } = await import("../to-platform");
    const { path, body } = toPlatform(plane(getModel("soul-2")));
    expect(path).toBe("higgsfield-ai/soul/v2/standard");
    expect(body.batch_size).toBe(1);
    expect(typeof body.batch_size).toBe("number");
  });

  it("routes Kling 3 to image-to-video once a start frame is present", async () => {
    const { toPlatform } = await import("../to-platform");
    const { path, body } = toPlatform(plane(getModel("kling-3-pro"), ["start", "end"]));
    expect(path).toBe("kling-video/v3.0/pro/image-to-video");
    expect(body.image_url).toBe("https://cdn.test/start-0.png");
    expect(body.last_image_url).toBe("https://cdn.test/end-0.png");
  });

  it("routes Seedance 2.5 to image-to-video when a start frame leads", async () => {
    const { toPlatform } = await import("../to-platform");
    const { path, body } = toPlatform(plane(getModel("seedance-2.5"), ["start"]));
    expect(path).toBe("bytedance/seedance-2.5/image-to-video");
    expect(body.image_url).toBe("https://cdn.test/start-0.png");
  });

  it("omits duration for Seedance 2.5 Edit, which declares none", async () => {
    const { toPlatform } = await import("../to-platform");
    const { body } = toPlatform(plane(getModel("seedance-2.5-edit"), ["video"]));
    expect(body).not.toHaveProperty("duration");
    expect(body.video_url).toBe("https://cdn.test/video-0.png");
  });
});
