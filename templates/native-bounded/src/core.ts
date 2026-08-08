import { Cmd } from "@native-sdk/core";

export interface Model {
  readonly ready: boolean;
}

export type Msg =
  | { readonly kind: "noop" }
  | { readonly kind: "noop_again" };

export const viewUnbound = ["noop", "noop_again"] as const;

export function initialModel(): Model {
  return { ready: true };
}

export function update(model: Model, _message: Msg): Model | [Model, Cmd<Msg>] {
  return model;
}
