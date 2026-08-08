# Progress

A display-only value control: bind `value` as a 0..1 fraction and the engine fills the bar — no events, no interaction. A `value` outside 0..1 is clamped at render, never an error. Give it a definite `width` (or a `grow`) to size the track. For a user-adjustable value use [slider](/docs/components/slider); for indeterminate waits use [spinner](/docs/components/spinner).

## Markup

```html
<progress value="{upload_fraction}" width="280" />
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.el(.progress, .{ .value = model.upload_fraction, .width = 280 }, .{})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `value` | Value for slider/progress/text entry; a literal or one {binding}. |
| `width` | Definite width (plain number): the element is exactly this wide; content neither shrinks nor overflows it. On resizable it is the initial width. |
