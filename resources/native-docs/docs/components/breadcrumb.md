# Breadcrumb

A row container for a hierarchy trail — children flow horizontally, and the trail is plain composition: muted `text` leaves for the ancestors, a muted `chevron-right` [icon](/docs/components/icon) between them, and an unmuted leaf for the current page. Binding `on-press` on a text leaf makes it pressable, so each ancestor can navigate.

## Markup

```html
<breadcrumb gap="8" cross="center">
  <text foreground="text_muted" on-press="open_home">Home</text>
  <icon name="chevron-right" foreground="text_muted" />
  <text foreground="text_muted" on-press="open_components">Components</text>
  <icon name="chevron-right" foreground="text_muted" />
  <text>Breadcrumb</text>
</breadcrumb>
```

For a model-driven trail, loop the ancestors and dispatch a payload per crumb:

```html
<breadcrumb gap="8" cross="center">
  <for each="crumbs" as="crumb" key="id">
    <text foreground="text_muted" on-press="open_crumb:{crumb.id}">{crumb.title}</text>
    <icon name="chevron-right" foreground="text_muted" />
  </for>
  <text>{current_title}</text>
</breadcrumb>
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.el(.breadcrumb, .{ .gap = 8, .cross = .center }, .{
    ui.text(.{ .style_tokens = .{ .foreground = .text_muted }, .on_press = .open_home }, "Home"),
    ui.icon(.{ .style_tokens = .{ .foreground = .text_muted } }, "chevron-right"),
    ui.text(.{ .style_tokens = .{ .foreground = .text_muted }, .on_press = .open_components }, "Components"),
    ui.icon(.{ .style_tokens = .{ .foreground = .text_muted } }, "chevron-right"),
    ui.text(.{}, "Breadcrumb"),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `gap` | Spacing between children (plain number). Rejected on stacking containers (stack, panel, card, the modal surfaces) — they layer children; put a column (or row) inside for flow. |
| `cross` | Cross-axis alignment: stretch\|start\|center\|end. |
| `on-press` | Dispatch a Msg on press: tag or tag:{payload}. Legal on any element — a bound press handler makes it pressable, and presses on plain text/icons inside it fall through to it (dragging still selects text). |
