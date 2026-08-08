# Replicator

Replicator creates personal native desktop utilities from natural-language requests and lets their owners revise them through further requests.

## Language

**Utility**:
A standalone native desktop application created for one person's specific need.
_Avoid_: Generated app, micro-app

**Build Request**:
A natural-language request that asks Replicator to create a new Utility.
_Avoid_: Prompt, initial prompt

**Revision Request**:
A natural-language request that asks Replicator to change an existing Utility.
_Avoid_: Follow-up prompt, resume request

**Clarification**:
A structured question that asks an owner to resolve material ambiguity in a Build Request or Revision Request before work continues.
_Avoid_: Assumption, planner question

**Reference Image**:
An image attached to a Build Request or Revision Request as guidance for a Utility's appearance or behavior. It is request context, not an asset automatically included in the Utility.
_Avoid_: App asset, uploaded asset

**Owner Timeline**:
The persisted sequence of an owner's Build Requests, Revision Requests, and Clarifications for one Utility. It excludes Claude's private transcript, narration, and tool activity.
_Avoid_: Conversation history, Claude transcript

**Request Attempt**:
One processing attempt for an existing Build Request or Revision Request. Retrying creates another attempt without adding a new request to the Owner Timeline.
_Avoid_: Retry request, new request

**Utility Format**:
The creation envelope selected for a Utility and retained across its Revision Requests. Replicator supports bounded Native, multi-module Native, and React/WebView formats.
_Avoid_: Target, build target

**Ready Artifact**:
The most recent behavior-verified, launchable application package for a Utility. It remains launchable until a verified replacement becomes ready.
_Avoid_: Current build, generated binary

**Claude Session**:
The active conversational context owned by one Utility and resumed when its owner submits a Revision Request. Its owner may explicitly replace it when it can no longer be resumed.
_Avoid_: Run, invocation

**Behavior Scenario**:
A target-executable sequence of setup, owner-like actions, and assertions that proves one aspect of a Utility's requested behavior.
_Avoid_: Test case, Claude claim

**Behavior Contract**:
The bounded set of at most three Behavior Scenarios that every candidate Ready Artifact must pass, including preserved behavior after Revision Requests.
_Avoid_: Test suite, acceptance checklist

**Verification Evidence**:
Digest-bound results and final screenshots captured by Replicator while it executes a Behavior Contract against a built Utility.
_Avoid_: Agent attestation, build log

**Submission Package**:
The complete judge-facing Replicator download, including the builder, its generation toolchain, temporary Claude access, and launch instructions.
_Avoid_: Installer, development build

**Prepared Demo**:
A clearly labelled, behavior-verified Utility and Owner Timeline included in every Submission Package as an immediate example and judging fallback. It is never represented as the result of a current live Request Attempt.
_Avoid_: Live result, sample app

**Submission Floor**:
The minimum product behavior and evidence that must pass before the Submission Package can be uploaded. If it fails, implementation continues on the critical path and the product claim is not narrowed to hide the failure.
_Avoid_: Nice-to-have checklist, partial success

**Acceptance Run**:
A controlled end-to-end Build Request or Revision Request executed through the assembled Submission Package to produce retained acceptance evidence.
_Avoid_: Unit test, ad hoc check
