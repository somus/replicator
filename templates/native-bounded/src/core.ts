import { Cmd } from "@native-sdk/core";

export interface Model {
  readonly message: "Ready" | "Activated";
}

export type Msg = { readonly kind: "activate" };

export function initialModel(): Model {
  return { message: "Ready" };
}

export function update(model: Model, msg: Msg): [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "activate":
      return [{ ...model, message: "Activated" }, Cmd.none];
  }
}
