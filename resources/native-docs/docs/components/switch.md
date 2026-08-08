# Switch

An on/off switch control. The label is the element's content, the model binds `checked`, and `on-toggle` dispatches its Msg — same contract as [checkbox](/docs/components/checkbox), rendered as a sliding thumb.

## Markup

```html
<column gap="12">
  <switch checked="{airplane_mode}" on-toggle="toggle_airplane_mode">Airplane mode</switch>
  <switch checked="{notifications}" on-toggle="toggle_notifications">Notifications</switch>
  <switch checked="true" disabled="true">Managed setting</switch>
</column>
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically — the widget kind is `.switch_control`:

```zig
ui.column(.{ .gap = 12 }, .{
    ui.el(.switch_control, .{ .text = "Airplane mode", .checked = model.airplane_mode, .on_toggle = .toggle_airplane_mode }, .{}),
    ui.el(.switch_control, .{ .text = "Notifications", .checked = model.notifications, .on_toggle = .toggle_notifications }, .{}),
    ui.el(.switch_control, .{ .text = "Managed setting", .checked = true, .disabled = true }, .{}),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `text` | Text value for text-bearing elements; a literal or one {binding}. |
| `checked` | Checked state for checkbox/toggle; true/false or a {binding}. |
| `disabled` | Disables the control; true/false or a {binding}. |
| `on-toggle` | Dispatch a Msg on toggle: tag or tag:{payload}. Hit-target elements only (checkbox, toggle, toggle-button, switch, accordion, ...). |
