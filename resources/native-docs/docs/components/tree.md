# Tree

A disclosure-tree container. The rows are ordinary elements (usually [list items](/docs/components/list)) carrying `role="treeitem"`, and every such descendant joins one roving keyboard focus set: Up/Down walk the visible rows, Left collapses a row or moves to its parent, Right expands or moves to the first child, Home/End jump to the edges. Expandable rows bind `expanded` and dispatch `on-toggle`. Selection follows `on-change` when the row binds it, letting pointer-only `on-press` perform a distinct action such as opening a preview; without `on-change`, selection keeps the compatible `on-press` behavior. The model owns both states — children of a collapsed row are simply not rendered.

## Markup

```html
<tree width="340" gap="2">
  <list-item icon="folder-open" role="treeitem" tree-level="1" expanded="{src_open}" on-toggle="toggle_src" on-press="select_src" on-change="select_src">src</list-item>
  <if test="{src_open}">
    <row>
      <column width="20" />
      <column gap="2" grow="1">
        <list-item icon="file-text" role="treeitem" tree-level="2" selected="{file == main}" on-press="preview_main" on-change="select_main">main.zig</list-item>
        <list-item icon="file-text" role="treeitem" tree-level="2" selected="{file == view}" on-press="preview_view" on-change="select_view">view.zig</list-item>
      </column>
    </row>
  </if>
  <list-item icon="folder" role="treeitem" tree-level="1" expanded="{assets_open}" on-toggle="toggle_assets" on-press="select_assets" on-change="select_assets">assets</list-item>
</tree>
```

The indent is plain layout — a fixed-width spacer column beside the children. Because those indented rows are layout siblings rather than widget descendants of the `src` row, `tree-level` supplies their one-based logical hierarchy. Structurally nested tree rows can omit it. Omit `expanded` on leaf rows; only rows that bind it participate in Left/Right disclosure.

## Programmatic construction (Zig)

In a Zig view, the `canvas.Ui` builder constructs the same tree programmatically:

```zig
ui.tree(.{ .width = 340, .gap = 2 }, .{
    ui.listItem(.{
        .icon = "folder-open",
        .tree_level = 1,
        .expanded = model.src_open,
        .on_toggle = .toggle_src,
        .on_press = .select_src,
        .on_change = .select_src,
        .semantics = .{ .role = .treeitem },
    }, "src"),
    if (model.src_open) ui.row(.{}, .{
        ui.column(.{ .width = 20 }, .{}),
        ui.column(.{ .gap = 2, .grow = 1 }, .{
            ui.listItem(.{ .icon = "file-text", .tree_level = 2, .selected = model.file == .main, .on_press = .preview_main, .on_change = .select_main, .semantics = .{ .role = .treeitem } }, "main.zig"),
            ui.listItem(.{ .icon = "file-text", .tree_level = 2, .selected = model.file == .view, .on_press = .preview_view, .on_change = .select_view, .semantics = .{ .role = .treeitem } }, "view.zig"),
        }),
    }) else ui.stack(.{}, .{}),
    ui.listItem(.{
        .icon = "folder",
        .tree_level = 1,
        .expanded = model.assets_open,
        .on_toggle = .toggle_assets,
        .on_press = .select_assets,
        .on_change = .select_assets,
        .semantics = .{ .role = .treeitem },
    }, "assets"),
})
```

## Attributes

| Attribute | Description |
| --- | --- |
| `role` | Accessibility role (listitem, treeitem, button, ...). treeitem also makes the row part of its tree's roving keyboard focus set. |
| `tree-level` | Flat sibling rows with role="treeitem": one-based logical depth used by Left/Right to resolve parents and first children. Omit it when tree rows are structurally nested. |
| `expanded` | Tree rows (role="treeitem"): disclosure state (true/false or a {binding}). Omit on leaves; expanded rows collapse on Left, collapsed ones expand on Right, both through on-toggle - the model owns the state. |
| `selected` | Selected state; often a {a == b} equality. |
| `on-toggle` | Dispatch a Msg on toggle: tag or tag:{payload}. Hit-target elements only (checkbox, toggle, toggle-button, switch, accordion, ...). |
| `on-change` | Dispatch a Msg on change: tag or tag:{payload}. Hit-target elements only. On a treeitem, Up/Down/Left/Right/Home/End focus movement prefers on-change over on-press, separating keyboard selection from pointer activation. |
| `on-press` | Dispatch a Msg on press: tag or tag:{payload}. Legal on any element — a bound press handler makes it pressable, and presses on plain text/icons inside it fall through to it (dragging still selects text). |
| `gap` | Spacing between children (plain number). Rejected on stacking containers (stack, panel, card, the modal surfaces) — they layer children; put a column (or row) inside for flow. |
| `label` | Accessible name; when set it REPLACES the element's text as the announced name - screen readers and automation snapshots see the label, never the text it shadows. |
