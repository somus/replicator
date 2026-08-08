# Split

`split` is a two-pane horizontal splitter with a draggable divider between exactly two element children. `value` binds the model-owned first-pane fraction, and `on-resize` names a Msg variant with an `f32` payload that delivers the applied fraction after every divider drag, keyboard adjustment, and assistive increment — echo it back into `value` in `update`, and the delivered fraction never fights the reconcile. `min-width` on the panes bounds the drag, `gap` sets the divider band thickness, and nesting splits gives you more panes. For a single panel with an engine-managed drag handle (no fraction bookkeeping), see [resizable](/docs/components/resizable).

## Markup

```html
<split value="{sidebar_fraction}" on-resize="sidebar_resized" gap="8" grow="1">
  <panel padding="12" min-width="180">
    <text foreground="text_muted">Sidebar</text>
  </panel>
  <panel padding="12" min-width="320">
    <text foreground="text_muted">Content</text>
  </panel>
</split>
```

A `value` of 0 lays out at 0.5, so a fresh model starts centered. Put conditional or repeated content inside a pane container — the split itself takes exactly two children.

In `update`, the arm echoes the applied fraction back into the bound field:

```ts
case "sidebar_resized":
  return { ...model, sidebar_fraction: msg.fraction };
```

```zig
.sidebar_resized => |fraction| model.sidebar_fraction = fraction,
```

## Animated resize

`resize-duration` (milliseconds) turns the bound `value` into a target: a rebuild that moves it — a collapse toggle in `update`, not a drag echo — eases the rendered fraction there instead of snapping, one step per presented frame, reflowing both panes exactly as a divider drag would and dispatching the same `on-resize` echoes. `resize-easing` names the curve (`linear`, `standard` — the default — `emphasized`, `spring`) and needs a nonzero duration beside it. Under a reduced-motion appearance the split snaps automatically — apps need do nothing. Omitting `resize-duration` (or setting 0) keeps today's snap.

```html
<split value="{sidebar_fraction}" resize-duration="180" resize-easing="standard" on-resize="sidebar_resized" gap="8" grow="1">
  <panel padding="12" min-width="180">
    <text foreground="text_muted">Sidebar</text>
  </panel>
  <panel padding="12" min-width="320">
    <text foreground="text_muted">Content</text>
  </panel>
</split>
```

Here `sidebar_fraction` is the model's declared resting fraction — flip it between the expanded and collapsed values in `update` and the runtime animates the divider there. In Zig views the same pair is `ElementOptions.resize_duration`/`resize_easing` on `ui.split`.

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically. `on_resize` pairs with `valueMsg`, which builds the `f32`-payload message constructor.

```zig
ui.split(.{
    .value = model.sidebar_fraction,
    .on_resize = Ui.valueMsg(.sidebar_resized),
    .gap = 8,
    .grow = 1,
}, .{
    ui.panel(.{ .padding = 12, .min_width = 180 }, .{
        ui.text(.{ .style_tokens = .{ .foreground = .text_muted } }, "Sidebar"),
    }),
    ui.panel(.{ .padding = 12, .min_width = 320 }, .{
        ui.text(.{ .style_tokens = .{ .foreground = .text_muted } }, "Content"),
    }),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `value` | Value for slider/progress/text entry; a literal or one {binding}. |
| `resize-duration` | split only: layout-tween duration in milliseconds (a plain number or one {binding}). Nonzero makes the bound value a TARGET - a rebuild that moves it lays both panes out at the target ONCE, then the runtime slides the rendered boundary there one presented frame at a time under the panes' clips (content never re-wraps mid-flight), dispatching ONE on-resize echo at settle with the applied fraction. 0 (and absent) snaps, today's behavior. A divider DRAG keeps live per-step reflow and echoes. Reduced-motion appearances snap automatically - apps declare nothing extra. |
| `resize-easing` | split only, beside a nonzero resize-duration: easing curve of the layout tween - linear, standard (the default), emphasized, or spring. Easing without a duration is a teaching error (it would be silently inert). |
| `min-width` | Width floor (plain number) without width's definite max: the element may grow past it but never shrink below. On split panes it bounds the divider drag. |
| `gap` | Spacing between children (plain number). Rejected on stacking containers (stack, panel, card, the modal surfaces) — they layer children; put a column (or row) inside for flow. |
| `on-resize` | split element only: names a Msg variant with f32 payload; delivers the applied first-pane fraction after every divider drag, keyboard adjustment, and assistive increment/decrement. Echo it back into value - the delivered fraction never fights the reconcile. |
