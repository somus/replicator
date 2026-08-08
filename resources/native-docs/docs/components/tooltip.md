# Tooltip

`tooltip` is a text leaf styled as a tooltip: its content (with `{}` interpolation) is the whole element. Setting `anchor="above"` (or `below`) floats it against its parent's frame — the `stack` that wraps the trigger and the tooltip as its sibling, the same shape [dropdown-menu](/docs/components/dropdown-menu) uses — and hands visibility to the runtime: the tooltip shows after the pointer has rested on its trigger for the hover-intent delay, and hides when the pointer leaves. The model never hears hover. For the chat-message surface, see [bubble](/docs/components/bubble).

## Markup

```html
<stack>
  <button variant="outline" icon="bold" label="Bold" on-press="toggle_bold" />
  <tooltip anchor="above">Bold the selection</tooltip>
</stack>
```

## Hover intent

An anchored tooltip never paints the instant its trigger is hovered: the runtime waits `tooltip-delay` milliseconds (default 600) on the recorded frame clock, so sweeping the pointer across a toolbar flashes nothing. After a pointer-hovered tooltip hides on leave, a shared 400ms warm window shows the **next** trigger's tooltip immediately and re-warms on each such hide — a dense toolbar explains itself one control at a time once the first tooltip has been earned. Only the pointer leaving warms: the other hide causes below (focus departure, Escape, a press, view blur) are deliberate endings, not the pointer moving on, so they open no warm window. `tooltip-delay="0"` opts a tooltip into showing the instant its trigger is hovered, and Escape dismisses a shown tooltip. Both windows are themable (`tooltip_show_delay_ms` / `tooltip_warm_window_ms` in the metric tokens); the defaults and the behaviors below match shadcn/ui's defaults (Base UI).

A shown tooltip's content is hoverable (WCAG 1.4.13; Base UI tooltips default `hoverable`): moving the pointer from the trigger into the tooltip — including across the anchor gap between them — keeps it open, and it hides only when the pointer leaves both the trigger and the tooltip. Scrolling steps the same machine: a trigger that scrolls out from under a stationary pointer hides its tooltip (or cancels its pending reveal), and a trigger the scroll brings under the pointer arms the normal delay.

Keyboard focus is the second reveal path, with no dwell: tabbing onto a tooltip-owning trigger shows its tooltip immediately (keyboard navigation is deliberate, and hover- or focus-revealed content must not depend on pointer timing), and moving focus on — or pressing Escape — hides it just as immediately without warming the pointer's skip window. Pressing dismisses tooltips outright: any pointer-down — primary or secondary, including a down that starts a context menu or a window drag — or Space/Enter on the focused trigger cancels a pending reveal, hides a shown tooltip, and closes the warm window, so an activated control does not re-explain itself on the post-click hover. A view that loses focus — to a sibling view or with the whole window — drops its tooltip state entirely and re-stamps the tooltip hidden.

Without `anchor`, the leaf keeps its classic behavior: a static element that paints whenever the view renders it — conditional layout under an `if` driven by the model.

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.el(.stack, .{}, .{
    ui.button(.{ .variant = .outline, .icon = "bold", .on_press = .toggle_bold, .semantics = .{ .label = "Bold" } }, ""),
    ui.el(.tooltip, .{ .text = "Bold the selection", .anchor = .above }, .{}),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `text` | Text value for text-bearing elements; a literal or one {binding}. |
| `anchor` | dropdown-menu and tooltip: floats the surface against its PARENT's frame instead of the flow (literal below or above; either side auto-flips at the window edges). Late z-pass above the whole tree, window-clipped — never cropped by a scroll pane, never reflows siblings. Put the surface beside its trigger inside a stack. An anchored tooltip's visibility is runtime-owned (hover intent on the trigger; see tooltip-delay), unlike the model-owned dropdown. |
| `anchor-alignment` | dropdown-menu and tooltip (with anchor): horizontal alignment against the anchor - start, end, or stretch (stretch also widens the surface to at least the anchor's width, the select-menu look). |
| `anchor-offset` | dropdown-menu and tooltip (with anchor): literal gap in points between the anchor edge and the surface (default 4). |
| `tooltip-delay` | tooltip only, beside anchor: hover-intent show delay in milliseconds (a plain number or one {binding}) - the runtime shows the anchored tooltip after its trigger has been hovered this long on the recorded frame clock. 0 shows the instant the trigger is hovered; absent follows the 600ms token default. A shared 400ms warm window after a pointer-hovered tooltip hides on leave skips the delay on the next trigger (no other hide cause warms); keyboard-focus reveals are always immediate. A delay without an anchor is a teaching error (it would be silently inert). |
