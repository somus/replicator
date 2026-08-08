# Components

The Native SDK ships a built-in component catalog with house-style defaults: neutral surfaces, sharp Geist typography, subtle borders, focus states, compact density, and token-driven color, radius, shadow, and motion. Every preview below is rendered by the engine itself — the deterministic reference renderer draws the same widgets your app ships, pixel for pixel, in both color schemes. Each card shows one representative rendering; the component's page has the full set of variations.

Native markup is the view language: every page leads with the component's element — its tags, attributes, and bindings, sourced from the markup validator's vocabulary. Where a sample dispatches into app logic, the core side appears in both authoring languages, TypeScript first with the Zig form one tab away. Each page closes with the component's programmatic construction — the `canvas.Ui` builder, for Zig views built without markup. For layout semantics, expressions, and the runtime contract, see [Native UI](/docs/native-ui).

- [Accordion](/docs/components/accordion) — Disclosure surface with a model-owned open state.
- [Alert](/docs/components/alert) — Inline callouts with icon and variant color.
- [Avatar](/docs/components/avatar) — Initials fallback and runtime-registered images.
- [Badge](/docs/components/badge) — Status labels in every variant.
- [Breadcrumb](/docs/components/breadcrumb) — Hierarchy trail with separators.
- [Bubble](/docs/components/bubble) — Chat-message surfaces for either side.
- [Button](/docs/components/button) — Variants, sizes, inline icons, and states.
- [Button Group](/docs/components/button-group) — Attached action buttons as one segmented bar.
- [Card](/docs/components/card) — The bordered, elevated surface container.
- [Chart](/docs/components/chart) — Line, bar, and band series (Zig builder).
- [Checkbox](/docs/components/checkbox) — Binary choice with model-owned state.
- [Code](/docs/components/code) — Highlighted source with line numbers and optional horizontal scrolling.
- [Combobox](/docs/components/combobox) — Text entry with an anchored suggestions menu.
- [Dialog](/docs/components/dialog) — Modal surface with model-owned dismissal.
- [Drawer](/docs/components/drawer) — Side-anchored modal surface.
- [Dropdown Menu](/docs/components/dropdown-menu) — Anchored floating menus and menu items.
- [Icon](/docs/components/icon) — The built-in vector icon registry.
- [Input](/docs/components/input) — Single-line text entry: input, text field, search field.
- [Input Group](/docs/components/input-group) — One bordered field: textarea plus accessory actions.
- [List](/docs/components/list) — Rows with icons, selection, and virtualization.
- [Markdown](/docs/components/markdown) — GFM rendering through native widgets.
- [Media Surface](/docs/components/media-surface) — Externally produced textures: video, camera, mpv.
- [Pagination](/docs/components/pagination) — Page navigation row.
- [Panel](/docs/components/panel) — The plain surface container.
- [Progress](/docs/components/progress) — Determinate progress bar.
- [Radio](/docs/components/radio) — Single choice within a radio group.
- [Resizable](/docs/components/resizable) — Panel with an engine-managed drag handle.
- [Scroll](/docs/components/scroll) — Scroll regions with model-observable offsets.
- [Select](/docs/components/select) — Trigger plus the anchored dropdown options pattern.
- [Separator](/docs/components/separator) — Hairline rules, horizontal and vertical.
- [Sheet](/docs/components/sheet) — Bottom-anchored modal surface.
- [Skeleton](/docs/components/skeleton) — Loading placeholders that sketch the content.
- [Slider](/docs/components/slider) — Continuous value control.
- [Spacer](/docs/components/spacer) — Flexible empty space between siblings.
- [Spinner](/docs/components/spinner) — Indeterminate progress leaf.
- [Split](/docs/components/split) — Draggable two-pane splitter.
- [Status Bar](/docs/components/status-bar) — Window-bottom status text.
- [Stepper](/docs/components/stepper) — Stage progress with completed/active/pending steps.
- [Switch](/docs/components/switch) — On/off switches with model-owned state.
- [Table](/docs/components/table) — Rows and cells with hairline dividers.
- [Tabs](/docs/components/tabs) — Tab strip over segmented controls.
- [Textarea](/docs/components/textarea) — Multi-line text entry.
- [Timeline](/docs/components/timeline) — Ledger list with indicators and connectors.
- [Toggle](/docs/components/toggle) — Pressed-state toggles, toggle buttons, and groups.
- [Tooltip](/docs/components/tooltip) — The floating label above the control it annotates.
- [Tree](/docs/components/tree) — Disclosure tree with one roving focus set.
- [Video](/docs/components/video) — Platform-decoded playback with house transport chrome.
- [Virtual List](/docs/components/virtual-list) — Windowed rows: the view builds only what's visible.
