# Skeleton

Loading states. The skeleton is a placeholder block — size it with `width` and `height` to sketch the shape of the content it stands in for, and swap it for the real widgets (behind an `if`) when the data lands. While mounted it pulses gently (an engine-owned opacity oscillation, like the spinner's spin — no wiring, and reduce-motion renders it static). The spinner is an indeterminate progress leaf for work with no measurable fraction; when there is one, use [progress](/docs/components/progress) instead.

## Markup

```html
<row gap="12" width="320">
  <skeleton width="44" height="44"></skeleton>
  <column gap="8" grow="1" main="center">
    <skeleton height="14"></skeleton>
    <skeleton height="14" width="180"></skeleton>
  </column>
</row>
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically. Skeleton has no sugar method; use `ui.el` with the element kind.

```zig
ui.row(.{ .gap = 12, .width = 320 }, .{
    ui.el(.skeleton, .{ .width = 44, .height = 44 }, .{}),
    ui.column(.{ .gap = 8, .grow = 1, .main = .center }, .{
        ui.el(.skeleton, .{ .height = 14 }, .{}),
        ui.el(.skeleton, .{ .height = 14, .width = 180 }, .{}),
    }),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `width` | Definite width (plain number): the element is exactly this wide; content neither shrinks nor overflows it. On resizable it is the initial width. |
| `height` | Definite height (plain number): the element is exactly this tall; content neither shrinks nor overflows it. |
