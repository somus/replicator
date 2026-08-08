# Icon

A vector icon leaf: `name` selects the icon, tint comes from the `foreground` color token, and size from `width`/`height` (square by default). A bare literal name is one of the curated built-in stroke icons — the markup compiler and the Zig builder both validate it at comptime against the registry, so icon references never rot. The same grammar powers the inline `icon` attribute on [button](/docs/components/button), toggle-button, list-item, menu-item, and badge, where the icon draws as part of the control's single hit target.

## Markup

```html
<row gap="20" cross="center">
  <icon name="play"></icon>
  <icon name="search" foreground="text_muted"></icon>
  <icon name="git-branch" width="28" height="28"></icon>
  <icon name="check-circle" foreground="success"></icon>
</row>
```

## App icons and bound names

Two more value forms open the vocabulary without weakening it:

- `app:<name>` draws an icon the app registered at boot with `canvas.icons.registerAppIcons` (comptime-parse the SVG with `canvas.svg_icon.parseComptime`). Declare the table as `pub const app_icons` on the app root and pass it to `registerAppIcons` in `main` — the model contract carries the same names, so `native check` verifies every `app:` reference against exactly what the app registers (with a did-you-mean). Without a fresh contract artifact the check degrades to structural checking and says so.
- `icon="{binding}"` defers the choice to model data — a field or function producing a built-in name or an `app:` name per row (a status icon per item, a play/pause toggle). The contract checks the binding resolves to a string.

Both forms resolve at draw time with an honest failure mode: a name that resolves nowhere renders the missing-icon fallback (a slashed circle) and logs a Debug warning naming the value — visible and loud, never a silent gap.

```html
<icon name="app:waveform" foreground="text_muted"></icon>
<button icon="{playPauseIcon}" on-press="toggle_play" label="Play or pause"></button>
```

## Registry

The full built-in set (`canvas.icons.known_icon_names`), rendered by the engine.

Built-in icon names: `alert`, `archive`, `arrow-down`, `arrow-right`, `arrow-up`, `check`, `check-circle`, `chevron-down`, `chevron-left`, `chevron-right`, `chevron-up`, `circle-dot`, `clock`, `copy`, `download`, `edit`, `ellipsis`, `external-link`, `eye`, `file-text`, `folder`, `folder-open`, `git-branch`, `git-merge`, `git-pull-request`, `info`, `menu`, `moon`, `music`, `panel-left`, `panel-right`, `pause`, `play`, `plus`, `refresh-cw`, `repeat`, `save`, `search`, `send`, `settings`, `shuffle`, `skip-back`, `skip-forward`, `sun`, `terminal`, `trash`, `volume`, `wrench`, `x`, `x-circle`.

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically. `ui.icon` takes the name as a comptime argument — an unknown name is a compile error pointing at `canvas.icons.known_icon_names`.

```zig
ui.row(.{ .gap = 20, .cross = .center }, .{
    ui.icon(.{}, "play"),
    ui.icon(.{ .style_tokens = .{ .foreground = .text_muted } }, "search"),
    ui.icon(.{ .width = 28, .height = 28 }, "git-branch"),
    ui.icon(.{ .style_tokens = .{ .foreground = .success } }, "check-circle"),
})
```

## Attributes

`name` is the icon element's own required attribute: a comptime-validated built-in name, an `app:<name>` reference to a registered app icon, or one `{binding}` resolving to such a name (not part of the shared attribute vocabulary). The rest are the shared sizing and tint attributes:

| Attribute | Description |
| --- | --- |
| `width` | Definite width (plain number): the element is exactly this wide; content neither shrinks nor overflows it. On resizable it is the initial width. |
| `height` | Definite height (plain number): the element is exactly this tall; content neither shrinks nor overflows it. |
| `foreground` | Foreground/text color token (literal ColorTokens field name, e.g. text, text_muted, success, warning, info). |
| `label` | Accessible name; when set it REPLACES the element's text as the announced name - screen readers and automation snapshots see the label, never the text it shadows. |
