# Media Surface

`media-surface` composites a texture produced **outside the widget tree** — a video decoder, a camera pipeline, an external renderer like mpv — into the layout like any widget: clipped by its parents, z-ordered with its siblings, transformed and rounded like everything else. It is the dynamic-texture primitive the media tier builds on.

The element binds one thing: `surface` takes one `{binding}` to a model-owned `u64` **surface id**. A Zig-tier producer targets the same id through the runtime's producer API (`runtime.acquireMediaSurfaceProducer`) and pushes tightly-packed RGBA8 frames from any thread — latest-wins, paced by the compositor's presented-frame clock, damage-tracked so an unchanged frame costs nothing. Surface ids are model data in the runtime-image-id spirit: never markup literals, `0` is the unbound sentinel, the high bit is reserved for the toolkit's texture namespace — a usable id is any nonzero value below bit 63, so clear the top bit if you hash into a `u64` — and the same id in the model is what makes record/replay and automation honest about which surface a view shows.

Until the first producer frame arrives, live hosts show a deterministic placeholder derived from the surface id. That placeholder is also **all the deterministic reference renderer ever shows**: texture contents are presentation chrome by policy, so goldens, reference screenshots, session fingerprints, and replay verification never depend on producer output. A recorded session replays fingerprint-identical with no producer attached.

## Markup

```html
<column gap="10">
  <media-surface surface="{preview}" height="180" radius="md" label="Camera preview" />
  <text foreground="text_muted">Awaiting producer frames</text>
</column>
```

The surface has no intrinsic size — like `image`, give it definite `width`/`height` or flex `grow`. It is display-only: presses fall through to the nearest pressable ancestor, and the a11y lint asks for a `label` describing the content.

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same leaf; the surface id rides the `image` channel (the same model-owned u64 shape registered images use):

```zig
ui.mediaSurface(.{ .image = model.preview_surface, .height = 180, .semantics = .{ .label = "Camera preview" } })
```

## Producing frames

Producers are Zig-tier toolkit extensions in this release — acquire a handle for the surface id and push frames from your decoder or render loop:

```zig
const producer = try runtime.acquireMediaSurfaceProducer(model.preview_surface);
defer producer.release();
// From any thread, e.g. the decoder's:
try producer.pushFrame(width, height, rgba8);
```

See [Media Producers](/docs/media-producers) for the full recipe: thread contract, pacing, teardown, and the external-renderer (mpv) shape.

## Attributes

| Attribute | Description |
| --- | --- |
| `surface` | media-surface: one {binding} to the model-owned u64 surface id a Zig-tier producer targets (runtime.acquireMediaSurfaceProducer). Required; surface ids are model data, never markup literals; 0 leaves the surface unbound and it draws nothing, and usable ids are nonzero values below bit 63 — the reserved media-surface texture namespace, which the producer acquire refuses. |
| `width` | Definite width (plain number): the element is exactly this wide; content neither shrinks nor overflows it. On resizable it is the initial width. |
| `height` | Definite height (plain number): the element is exactly this tall; content neither shrinks nor overflows it. |
| `grow` | Flex grow factor; give spacer one. |
| `radius` | Corner radius token (literal RadiusTokens field name: sm, md, lg, xl). |
| `label` | Accessible name; when set it REPLACES the element's text as the announced name - screen readers and automation snapshots see the label, never the text it shadows. |
| `key` | Sibling-scoped identity key; on for, names an item field. |
| `global-key` | Parent-independent identity: ids survive reparenting between containers. |
