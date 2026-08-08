# Spinner

An indeterminate progress leaf for work with no measurable fraction; when there is one, use [progress](/docs/components/progress) instead. For a placeholder that sketches the shape of the loading content, use [skeleton](/docs/components/skeleton).

## Markup

```html
<row gap="12" cross="center">
  <spinner></spinner>
  <text foreground="text_muted">Loading notes…</text>
</row>
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically. Spinner has no sugar method; use `ui.el` with the element kind.

```zig
ui.row(.{ .gap = 12, .cross = .center }, .{
    ui.el(.spinner, .{}, .{}),
    ui.text(.{ .style_tokens = .{ .foreground = .text_muted } }, "Loading notes…"),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `width` | Definite width (plain number): the element is exactly this wide; content neither shrinks nor overflows it. On resizable it is the initial width. |
| `height` | Definite height (plain number): the element is exactly this tall; content neither shrinks nor overflows it. |
