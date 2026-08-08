import { asciiBytes, Cmd } from "@native-sdk/core";

export interface Model {
  readonly status: Uint8Array;
}

export type Msg =
  | { readonly kind: "confirm" }
  | { readonly kind: "noop" };

export const viewUnbound = ["noop"] as const;

export function initialModel(): Model {
  return { status: asciiBytes("Built, packaged, and launched from bundled tools.") };
}

export function update(model: Model, msg: Msg): [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "confirm":
      return [{ status: asciiBytes("Standalone Utility confirmed.") }, Cmd.none];
    case "noop":
      return [model, Cmd.none];
  }
}
