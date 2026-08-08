# Video

`video` plays the app's **single platform-decoded video** through the media-surface texture channel: on macOS, AVFoundation decodes straight into the compositor while your app core sees only commands and journaled events — pixels never cross the model boundary. Hosts without a decoder yet (Windows and Linux today) report the capability honestly and answer a load with one explicit `failed` event, never a silent stub.

`src` declares the source — an app-assets path, or an `http(s)` URL streamed progressively — resolved local-first, exactly like audio. Declaring a `src` loads the player (a changed `src` replaces the playback whole; one player is the whole surface); `autoplay` (the default), `loop`, and `muted` shape the fresh playback. The picture always aspect-fits its box (contain): the decoded frame draws centered at the stream's reported proportions, letterboxed or pillarboxed on black — never stretched, never cropped.

`controls` composes the **house transport chrome** under the picture: a play/pause button, a scrub slider, and elapsed/duration readouts — runtime-driven, so your model carries no transport state at all. Without `controls` the element is the surface alone: compose your own controls from the video command vocabulary (`Cmd.videoLoad`/`videoCtl` in TypeScript, `fx.loadVideo` and the transport verbs in Zig), the audio pattern.

Until a decoded frame arrives — and in every golden, reference screenshot, and session replay — the surface shows its deterministic id-derived placeholder: texture contents are presentation chrome by policy, while the transport (loaded dimensions and duration, position ticks, buffering, completion, failures) is journaled truth that replays byte-identically with no decoder behind it.

## Markup

```html
<column gap="10">
  <video src="assets/clips/launch.mp4" controls height="200" label="Launch clip" />
  <video src="{model.trailerUrl}" autoplay="false" muted height="200" label="Trailer" />
</column>
```

The element is a leaf (no children) with no intrinsic size — give it definite `width`/`height` or flex `grow`, and a `label` for screen readers (the image rule).

## Programmatic construction (Zig)

```zig
ui.video(.{
    .src = "assets/clips/launch.mp4",
    .controls = true,
    .height = 200,
    .label = "Launch clip",
})
```

## Custom controls

Bare `<video src>` plus your own chrome is the audio pattern end to end: transport events arrive as ordinary messages, and the transport verbs drive the same single player the element loaded.

```zig
// update
.toggle_play => if (model.playing) fx.pauseVideo() else fx.playVideo(),
.scrubbed => |fraction| fx.seekVideo(@intFromFloat(fraction * @as(f64, @floatFromInt(model.duration_ms)))),
```

See the video-player example for a complete player at both tiers — house chrome on one screen, custom controls on another.

## Attributes

| Attribute | Description |
| --- | --- |
| `src` | video: the source string — an app-assets path (tried first as a local file) or an http(s) URL (streamed progressively when the local file is absent), a literal or one {binding}. Declaring it loads the app's SINGLE video player (a changed src replaces the playback whole); omit it to render the surface alone over a playback your update code drives. |
| `controls` | video: composes the house transport chrome under the picture — play/pause, a scrub slider, and elapsed/duration readouts, runtime-driven so the model carries no transport state. Omit it for the bare surface and compose your own controls from the video command vocabulary. |
| `autoplay` | video: start playing as soon as the load lands (the default). false loads paused at the first frame — the poster shape; play resumes it. |
| `loop` | video: wrap from the natural end back to the start and keep playing. A looping playback never delivers a completed event — it never ends. |
| `muted` | video: start with the audio track muted (a reversible switch, independent of the remembered volume). |
| `width` | Definite width (plain number): the element is exactly this wide (no intrinsic size). |
| `height` | Definite height (plain number): the element is exactly this tall (no intrinsic size). |
| `grow` | Flex grow factor. |
| `label` | Accessible name for the picture (the image rule: unnamed video degrades to an unnamed image for screen readers; label="" marks it decorative). |
| `key` | Sibling-scoped identity key. |
| `global-key` | Parent-independent identity: ids survive reparenting between containers. |
