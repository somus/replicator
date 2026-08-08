# Card

`card` is the bordered, elevated surface container. It is a stacking container — children layer on top of each other and `gap` is rejected — so put a single `column` (or `row`) inside for flow. Cards carry 24px of content padding by default (the house inset; 16 at `size="sm"`) — set `padding` explicitly to override it. Binding `on-press` makes the whole surface pressable, the list-of-cards pattern. For the plain surface with the same stacking contract, see [panel](/docs/components/panel).

## Markup

```html
<card width="340">
  <column gap="12">
    <text>Deploy your app</text>
    <text wrap="true" foreground="text_muted">The runtime packages your views, commands, and assets into one native binary.</text>
    <row gap="8">
      <button variant="primary" on-press="deploy">Deploy</button>
      <button variant="ghost" on-press="cancel">Cancel</button>
    </row>
  </column>
</card>
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.el(.card, .{ .width = 340 }, .{
    ui.column(.{ .gap = 12 }, .{
        ui.text(.{}, "Deploy your app"),
        ui.text(.{ .wrap = true, .style_tokens = .{ .foreground = .text_muted } }, "The runtime packages your views, commands, and assets into one native binary."),
        ui.row(.{ .gap = 8 }, .{
            ui.button(.{ .variant = .primary, .on_press = .deploy }, "Deploy"),
            ui.button(.{ .variant = .ghost, .on_press = .cancel }, "Cancel"),
        }),
    }),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `text` | Text value for text-bearing elements; a literal or one {binding}. |
| `padding` | Uniform padding (plain number). |
| `width` | Definite width (plain number): the element is exactly this wide; content neither shrinks nor overflows it. On resizable it is the initial width. |
| `on-press` | Dispatch a Msg on press: tag or tag:{payload}. Legal on any element — a bound press handler makes it pressable, and presses on plain text/icons inside it fall through to it (dragging still selects text). |
