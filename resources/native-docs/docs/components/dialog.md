# Dialog

A modal dialog surface rendered in place: the title comes from the `text` attribute, and visibility is model-owned — wrap the dialog in an `if` on an open flag. `on-dismiss` dispatches when Escape or a click outside dismisses the surface, so `update` clears the flag; the engine hides the surface immediately as an optimistic echo, and the source tree wins on the next rebuild. The title is drawn by the surface chrome and children stack over the full content box, so lead the body column with a fixed-height spacer that clears the title line. For edge-anchored surfaces with the same contract, see [drawer](/docs/components/drawer) and [sheet](/docs/components/sheet).

## Markup

```html
<column padding="24">
  <button variant="outline" on-press="open_rename">Rename note</button>
  <if test="{rename_open}">
    <dialog text="Rename note" width="380" height="240" padding="24" on-dismiss="close_rename">
      <column gap="14">
        <spacer height="34"></spacer>
        <text wrap="true" foreground="text_muted">The new name shows up everywhere this note is linked.</text>
        <input text="{draft_name}" label="New name" on-input="name_edited" on-submit="confirm_rename"></input>
        <row gap="8" main="end">
          <button variant="ghost" on-press="close_rename">Cancel</button>
          <button variant="primary" on-press="confirm_rename">Rename</button>
        </row>
      </column>
    </dialog>
  </if>
</column>
```

The open flag is the whole core contract — one field, one arm setting it, one clearing it (`on-dismiss` and the Cancel button share the close arm):

```ts
// model: { readonly rename_open: boolean }
case "open_rename":
  return { ...model, rename_open: true };
case "close_rename":
  return { ...model, rename_open: false };
```

```zig
// model: rename_open: bool = false,
.open_rename => model.rename_open = true,
.close_rename => model.rename_open = false,
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically. The dialog is a plain element kind, so the builder form is `ui.el(.dialog, ...)`; build it only while the model's open flag is set.

```zig
// Rendered only while model.rename_open is true; on_dismiss clears it in update.
ui.el(.dialog, .{ .text = "Rename note", .width = 380, .height = 240, .padding = 24, .on_dismiss = .close_rename }, .{
    ui.column(.{ .gap = 14 }, .{
        ui.column(.{ .height = 34 }, .{}), // clears the engine-drawn title line
        ui.text(.{ .wrap = true, .style_tokens = .{ .foreground = .text_muted } }, "The new name shows up everywhere this note is linked."),
        ui.el(.input, .{ .text = model.draft_name, .on_input = Ui.inputMsg(.name_edited), .on_submit = .confirm_rename, .semantics = .{ .label = "New name" } }, .{}),
        ui.row(.{ .gap = 8, .main = .end }, .{
            ui.button(.{ .variant = .ghost, .on_press = .close_rename }, "Cancel"),
            ui.button(.{ .variant = .primary, .on_press = .confirm_rename }, "Rename"),
        }),
    }),
})
```

## Attributes

Note that `gap` is rejected on the dialog itself — it layers children like the other stacking surfaces; put a column (or row) inside for flow.

| Attribute | Description |
| --- | --- |
| `text` | Text value for text-bearing elements; a literal or one {binding}. |
| `width` | Definite width (plain number): the element is exactly this wide; content neither shrinks nor overflows it. On resizable it is the initial width. |
| `height` | Definite height (plain number): the element is exactly this tall; content neither shrinks nor overflows it. |
| `padding` | Uniform padding (plain number). |
| `on-dismiss` | Dismissible surfaces only (dialog, drawer, sheet, dropdown-menu): Msg dispatched when Escape or a click outside dismisses the surface, so the MODEL owns the close (clear the open flag in update). The engine hides the surface immediately as an optimistic echo; the source tree wins on the next rebuild. |
