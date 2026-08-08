# Radio

The single-choice value control, grouped by a `radio-group` row container. Like [checkbox](/docs/components/checkbox), the label rides the `text` attribute — radio is not a text-bearing element, so text content between the tags is rejected with a teaching error. One model field holds the group's selection: render it with `{a == b}` equalities on each radio's `checked`, and let each radio's `on-toggle` dispatch the Msg that sets the field — the engine never flips state on its own.

## Markup

```html
<radio-group gap="12">
  <radio checked="{density == default}" on-toggle="set_default" text="Default" />
  <radio checked="{density == comfortable}" on-toggle="set_comfortable" text="Comfortable" />
  <radio checked="{density == compact}" disabled="true" text="Compact" />
</radio-group>
```

One field holds the group's choice — a string-literal union in a TypeScript core, an enum in a Zig core — and each radio's arm sets it:

```ts
// model: { readonly density: "default" | "comfortable" | "compact" }
case "set_comfortable":
  return { ...model, density: "comfortable" };
```

```zig
// model: density: enum { default, comfortable, compact } = .default,
.set_comfortable => model.density = .comfortable,
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.el(.radio_group, .{ .gap = 12 }, .{
    ui.el(.radio, .{ .text = "Default", .checked = model.density == .default, .on_toggle = .set_default }, .{}),
    ui.el(.radio, .{ .text = "Comfortable", .checked = model.density == .comfortable, .on_toggle = .set_comfortable }, .{}),
    ui.el(.radio, .{ .text = "Compact", .checked = model.density == .compact, .disabled = true }, .{}),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `text` | Text value for text-bearing elements; a literal or one {binding}. |
| `checked` | Checked state for checkbox/toggle; true/false or a {binding}. |
| `disabled` | Disables the control; true/false or a {binding}. |
| `on-toggle` | Dispatch a Msg on toggle: tag or tag:{payload}. Hit-target elements only (checkbox, toggle, toggle-button, switch, accordion, ...). |
