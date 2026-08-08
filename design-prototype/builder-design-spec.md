# Replicator builder design decision

## Approved direction

Use a dark-first, expressive macOS workspace with a persistent Utility library on the left and the selected Utility's Owner Timeline on the right. The hero state is a Ready Utility that can be launched and revised from the same screen.

The builder should feel like a creator tool for personal software. It must not expose source code, terminal output, or an IDE-like file tree.

## Frame and layout

- Design target: 1440 x 1024 desktop window.
- Minimum useful viewport: 880 x 680.
- Sidebar: 372 px at the design target, 300 px below 1080 px.
- Utility header: 150 px with generated icon, name, semantic status, description, Launch, and overflow actions.
- Owner Timeline: one vertical axis with chronological Build Requests, Clarifications, plans, milestones, outcomes, and Revision Requests.
- Composer: anchored to the bottom of the workspace, 146 px at the design target. Reference Images are attached inside the composer.
- The workspace scrolls independently. The Utility library, selected Utility header, and composer remain in place.

## Visual tokens

- Background: `#080A0B`.
- Sidebar: `#0D1012`.
- Primary surface: `#111518`.
- Strong surface: `#151A1E`.
- Primary text: `#F7F9F8`.
- Secondary text: `#9BA4AA`.
- Quiet text: `#707A80`.
- Primary and Ready: `#69E6BA`.
- Building: `#8CBCFF`.
- Clarification: `#F2BA62`.
- Failure: `#FF7C83`.
- Default border: white at 9% opacity; strong border: white at 14% opacity.
- Font: system San Francisco stack. Use display weight around 720, control weight around 620, and body weight 400 to 500.
- Main radii: 18 px generated icon, 13 to 14 px cards/composer, 9 to 11 px controls.

## Core components

- **Utility Library:** name, short description, generated icon, semantic status, selected highlight, New Utility action, owner identity, and Settings.
- **Utility Header:** generated icon, name, immutable format hidden from the primary UI, semantic status, short description, Launch, and overflow menu.
- **Owner Timeline:** owner and Claude nodes, timestamp, event title, concise content, and semantic outcome treatment.
- **Clarification Batch:** one or more explicit questions with bounded choices or a short response, answered together before continuing.
- **Progress Milestone:** human-readable planning, creation, validation, and preparation states. Never stream raw tool logs.
- **Failure Outcome:** plain-language failure, saved-source assurance where true, and one Retry action.
- **Composer:** Revision Request input, Reference Image attachment, visible Send label, and disabled copy explaining why a request cannot start.
- **Toast:** short confirmation for Launch, Ready, recovery, and other completed direct actions.

## State behavior

| State | Header | Timeline | Composer | Primary action |
| --- | --- | --- | --- | --- |
| New Utility | Creation title | Hidden | Large Build Request composer | Build Utility |
| Planning | Planning | Build Request and plan progress | Disabled | Cancel |
| Awaiting Clarification | Needs input | Clarification Batch | Disabled | Continue after all required answers |
| Building or verifying | Building | Current human-readable milestone | Disabled | Cancel |
| Ready | Ready | Current Ready outcome and history | Enabled | Launch or Send Revision |
| Failed | Needs attention | Failure outcome and recovery copy | Disabled | Retry |
| Interrupted | Interrupted | Last safe outcome | Disabled | Retry |

Only one Request Attempt may be active globally. While one is active, owners may select and launch Ready Utilities, but New Utility, Revision, Retry, rename, and delete controls are disabled with explanatory copy. There is no queue.

## Interactions

- Selecting a Utility replaces the header and Owner Timeline without changing windows.
- New Utility opens a focused creation canvas in the workspace while retaining the library.
- Reference Image attachment accepts up to four supported images and renders removable filename chips.
- Clarifications appear inside the Owner Timeline and must be answered before the plan locks.
- Launch is always available for a Ready Artifact, including when another Utility is busy.
- Sending a Revision Request appends it to the Owner Timeline, disables request controls globally, and moves the selected Utility through progress to Ready or Failed.
- Cancel changes the active Request Attempt to Interrupted after termination. Retry starts a fresh Request Attempt from persisted source or the last safe snapshot.
- Failed initial builds retain partial source. Failed revisions restore the previous Ready snapshot before showing the failure outcome.

## Motion and feedback

- Use 130 to 180 ms transitions for hover, press, selection, toast entry, and small surface changes.
- Use continuous rotation only for the Building spinner.
- Avoid decorative page transitions, large parallax, springy movement, and ambient animation during generation.
- Respect `prefers-reduced-motion` by reducing all nonessential animation to an immediate state change.

## Accessibility

- Every status includes text and an icon; color is supplementary.
- Maintain visible keyboard focus with a 2 px mint ring and 2 px offset.
- Keep persistent controls visible at the minimum supported viewport.
- Use native buttons, textareas, fieldsets, and legends for core interactions.
- Keep timeline body text at least 14 px and control text at least 12 px at the design target.
- Disable unavailable controls instead of hiding them, and explain the busy state in the composer placeholder or adjacent copy.

## Hackathon scope cuts

Do not build light mode, onboarding, code inspection, raw logs, a queue, drag-and-drop library organization, custom window chrome behavior, advanced generated-icon editing, search, cloud sync, analytics, or storage meters. These do not improve the judging loop enough to justify the time.

## Approved visual evidence

- Selected visual target: `reference-design.png`.
- Browser implementation: `implementation-ready.jpg`.
- Full comparison: `comparison-ready-final.png`.
- Additional state captures: `implementation-create.jpg`, `implementation-clarification.jpg`, and `implementation-failed.jpg`.
- QA record: `design-qa.md`, final result passed.
