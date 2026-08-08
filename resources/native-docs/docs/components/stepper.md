# Stepper

A stage stepper: `step` children joined by hairline connectors, with `active` naming the current step index — earlier steps render completed (a check indicator), later ones pending, and an index past the last step renders every step completed. Display-only: driving `active` belongs to the app model. Step children are text leaves only (the label supports `{}` interpolation); their completed/active/pending state derives entirely from the stepper's `active` index. For a vertical run ledger, see [timeline](/docs/components/timeline).

## Markup

`active` is required — a number or one `{binding}`.

```html
<stepper active="{publish_step}">
  <step>Draft</step>
  <step>Review</step>
  <step>Publish</step>
</stepper>
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.stepper(.{ .active = model.publish_step }, &.{
    .{ .label = "Draft" },
    .{ .label = "Review" },
    .{ .label = "Publish" },
})
```

## Eject

When theming is not enough and you need to own the stepper's *shape*, eject it: the canonical source lands in your project as your code — SDK updates never touch it, and ejecting twice errors instead of overwriting your edits. `stepper` ejects as a Zig view function (`src/components/stepper.zig`).

```sh
native eject component stepper
```

The ownership model and what to do after ejecting are in [Use, eject, or build](/docs/building-components#use-eject-or-build).

## Attributes

| Attribute | Description |
| --- | --- |
| `active` | stepper: the active step index (a number or one {binding}); earlier steps render completed, later ones pending. Required. |
| `key` | Sibling-scoped identity key. |
| `global-key` | Parent-independent identity: ids survive reparenting between containers. |
| `label` | Accessible name; when set it REPLACES the element's text as the announced name - screen readers and automation snapshots see the label, never the text it shadows. |
