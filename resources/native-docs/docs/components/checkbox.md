# Checkbox

A binary value control: the label rides the `text` attribute — checkbox is not a text-bearing element, so text content between the tags is rejected with a teaching error (`label="..."` alone names one for accessibility without a visible label). The model binds `checked`, and `on-toggle` dispatches its Msg — the engine never flips state on its own. For a single choice among options, use [radio](/docs/components/radio); for an on/off setting rendered as a sliding thumb, use [switch](/docs/components/switch).

## Markup

```html
<column gap="12">
  <checkbox checked="{accepted}" on-toggle="toggle_terms" text="Accept terms and conditions" />
  <checkbox checked="{reports}" on-toggle="toggle_reports" text="Send usage reports" />
  <checkbox checked="true" disabled="true" text="Managed by your organization" />
</column>
```

The core side is one boolean per box and one arm flipping it:

```ts
// model: { readonly accepted: boolean }
case "toggle_terms":
  return { ...model, accepted: !model.accepted };
```

```zig
// model: accepted: bool = false,
.toggle_terms => model.accepted = !model.accepted,
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.column(.{ .gap = 12 }, .{
    ui.checkbox(.{ .text = "Accept terms and conditions", .checked = model.accepted, .on_toggle = .toggle_terms }),
    ui.checkbox(.{ .text = "Send usage reports", .checked = model.reports, .on_toggle = .toggle_reports }),
    ui.checkbox(.{ .text = "Managed by your organization", .checked = true, .disabled = true }),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `text` | Text value for text-bearing elements; a literal or one {binding}. |
| `checked` | Checked state for checkbox/toggle; true/false or a {binding}. |
| `disabled` | Disables the control; true/false or a {binding}. |
| `on-toggle` | Dispatch a Msg on toggle: tag or tag:{payload}. Hit-target elements only (checkbox, toggle, toggle-button, switch, accordion, ...). |
