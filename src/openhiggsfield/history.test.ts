import { describe, expect, it } from "vitest";

import {
  capHistory,
  mergeHistory,
  requestIdOf,
  replaceRequest,
  stepRun,
  timeAgo,
  type RunRecord,
} from "./history";

let seq = 0;

function row(over: Partial<RunRecord> = {}): RunRecord {
  seq += 1;
  return {
    id: `run-${seq}`,
    surface: "video",
    modelId: "wan-3",
    modelLabel: "Wan 3.0",
    prompt: "a lighthouse in heavy swell",
    ratio: "16 / 9",
    meta: "720p · 5s",
    kind: "video",
    urls: [],
    status: "completed",
    art: "linear-gradient(0deg, #000, #111)",
    createdAt: 1_000 + seq,
    ...over,
  };
}

describe("capHistory", () => {
  it("leaves a log under the cap untouched, in order", () => {
    const rows = [row(), row(), row()];
    expect(capHistory(rows, 5)).toEqual(rows);
  });

  /* Every caller sorts newest-first before capping, so the cap keeps the first
     `max` rows it sees. Documented here so a future caller that hands it an
     unsorted log breaks this test rather than silently keeping the oldest. */
  it("trims the oldest unmarked runs past the cap", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ createdAt: 4 - i }));
    expect(capHistory(rows, 3).map((r) => r.createdAt)).toEqual([4, 3, 2]);
  });

  it("never ages a favorite out of the window", () => {
    const kept = row({ createdAt: 0, favorite: true });
    const rows = [...Array.from({ length: 5 }, (_, i) => row({ createdAt: 9 - i })), kept];
    const capped = capHistory(rows, 2);
    expect(capped).toContain(kept);
    expect(capped).toHaveLength(3); /* two fresh runs plus the favorite */
  });

  it("never ages a run still in flight out of the window", () => {
    const running = row({ createdAt: 0, status: "running", requestId: "req-1" });
    const rows = [...Array.from({ length: 5 }, (_, i) => row({ createdAt: 9 - i })), running];
    expect(capHistory(rows, 2)).toContain(running);
  });

  it("treats an absent favorite flag as not kept", () => {
    const rows = Array.from({ length: 4 }, (_, i) => row({ createdAt: i, favorite: undefined }));
    expect(capHistory(rows, 2)).toHaveLength(2);
  });
});

describe("mergeHistory", () => {
  it("lets a live session row win over the stored copy of the same id", () => {
    const stored = row({ id: "shared", status: "running", requestId: "req-1" });
    const live = row({ id: "shared", status: "completed", urls: ["https://cdn.test/a.mp4"] });
    const merged = mergeHistory([stored], [live]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.status).toBe("completed");
  });

  it("does not let a stale stored row overwrite a finished one", () => {
    const stored = row({ id: "shared", status: "running", requestId: "req-1" });
    const live = row({ id: "shared", status: "completed" });
    expect(mergeHistory([stored], [live])[0]!.status).toBe("completed");
    expect(mergeHistory([live], [stored])[0]!.status).toBe("completed");
  });

  it("keeps the newer of two finished rows", () => {
    const older = row({ id: "shared", createdAt: 10 });
    const newer = row({ id: "shared", createdAt: 20 });
    expect(mergeHistory([older], [newer])[0]!.createdAt).toBe(20);
  });

  it("sorts newest first and drops nothing below the cap", () => {
    const rows = [row({ createdAt: 1 }), row({ createdAt: 9 }), row({ createdAt: 5 })];
    expect(mergeHistory(rows, []).map((r) => r.createdAt)).toEqual([9, 5, 1]);
  });
});

describe("replaceRequest", () => {
  it("swaps every row of a request for its terminal records", () => {
    const pending = [
      row({ id: "req-1#0", status: "running", requestId: "req-1" }),
      row({ id: "req-1#1", status: "running", requestId: "req-1" }),
    ];
    const done = [row({ id: "req-1#0", requestId: "req-1", urls: ["https://cdn.test/a.mp4"] })];
    const next = replaceRequest(pending, "req-1", done);
    expect(next).toHaveLength(1);
    expect(next[0]!.urls).toEqual(["https://cdn.test/a.mp4"]);
  });

  it("no-ops when the visitor already deleted the in-flight tiles", () => {
    const others = [row({ id: "other" })];
    const done = [row({ id: "req-1#0", requestId: "req-1" })];
    expect(replaceRequest(others, "req-1", done)).toBe(others);
  });

  it("leaves rows belonging to a different request alone", () => {
    const pending = [row({ id: "req-1#0", status: "running", requestId: "req-1" })];
    const unrelated = row({ id: "req-2#0", status: "running", requestId: "req-2" });
    const next = replaceRequest([unrelated, ...pending], "req-1", [
      row({ id: "req-1#0", requestId: "req-1" }),
    ]);
    expect(next.map((r) => r.id)).toContain("req-2#0");
  });
});

describe("requestIdOf", () => {
  it("prefers the recorded id", () => {
    expect(requestIdOf(row({ id: "a#0", requestId: "real" }))).toBe("real");
  });

  it("falls back to the part before the offset", () => {
    expect(requestIdOf(row({ id: "req-9#3" }))).toBe("req-9");
    expect(requestIdOf(row({ id: "plain" }))).toBe("plain");
  });
});

describe("stepRun", () => {
  const rows = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })];

  it("walks one step in either direction", () => {
    expect(stepRun(rows, "b", -1)?.id).toBe("a");
    expect(stepRun(rows, "b", 1)?.id).toBe("c");
  });

  it("stops at the ends rather than wrapping", () => {
    expect(stepRun(rows, "a", -1)).toBeNull();
    expect(stepRun(rows, "c", 1)).toBeNull();
  });

  it("steps nowhere for a run that has left the list", () => {
    expect(stepRun(rows, "gone", 1)).toBeNull();
  });
});

describe("timeAgo", () => {
  const now = 1_000_000;
  const at = (secondsAgo: number) => now - secondsAgo * 1000;

  it("reads the usual buckets", () => {
    expect(timeAgo(at(0), now)).toBe("just now");
    expect(timeAgo(at(59), now)).toBe("just now");
    expect(timeAgo(at(60), now)).toBe("1 min ago");
    expect(timeAgo(at(3599), now)).toBe("59 min ago");
    expect(timeAgo(at(3600), now)).toBe("1 hr ago");
    expect(timeAgo(at(86400), now)).toBe("1 d ago");
  });

  it("never reports a negative interval for a clock skew", () => {
    expect(timeAgo(now + 5000, now)).toBe("just now");
  });
});
