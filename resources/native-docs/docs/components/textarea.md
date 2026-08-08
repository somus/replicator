# Textarea

Multi-line text entry. Like [input](/docs/components/input), `text` and `placeholder` bind from the model and `on-input` names a Msg variant that receives every edit as a text-input event — see [input](/docs/components/input) for the core-side contract in both languages. Enter (and Shift+Enter) inserts a newline instead of submitting; when a textarea carries `on-submit`, the submit rides the primary chord — Cmd+Enter on macOS, Ctrl+Enter elsewhere. Give it a definite `width` and `height` (or a `grow`) to size the editing box.

## Markup

```html
<textarea width="320" height="96" placeholder="Write a release note" text="{draft}" on-input="draft_edited" />
```

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.el(.textarea, .{
    .width = 320,
    .height = 96,
    .placeholder = "Write a release note",
    .text = model.draft,
    .on_input = Ui.inputMsg(.draft_edited),
}, .{})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `text` | Text value for text-bearing elements; a literal or one {binding}. |
| `placeholder` | Hint text shown while a text entry is empty. |
| `disabled` | Disables the control; true/false or a {binding}. |
| `autofocus` | Focusable controls only: moves keyboard focus to the element when it mounts or when the value turns on (edge-triggered - holding it true never re-steals focus). The TEA way to focus an editor on create. |
| `on-input` | Names a Msg variant with canvas.TextInputEvent payload; delivers each text edit. |
| `on-submit` | Dispatch a Msg on submit: tag or tag:{payload}. Enter in a text field, primary+enter in a textarea; on a list-item, plain Enter dispatches it as the row's primary action while Space keeps the row's select (on-press). |
