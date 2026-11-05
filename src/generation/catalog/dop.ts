import { videoModel } from "./defaults";
import type { ModelEntry } from "./types";

export const dop: ModelEntry = {
  ...videoModel("dop", "DoP", { start: 1 }, { image: "higgsfield-ai/dop/lite" }),
  required: ["start"],
};
