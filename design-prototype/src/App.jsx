import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowUp,
  Check,
  CheckCircle,
  Clock,
  DotsThree,
  FileText,
  Gear,
  ImageSquare,
  ListChecks,
  PaperPlaneTilt,
  Play,
  Plus,
  Question,
  Sparkle,
  SpinnerGap,
  Timer,
  TrendUp,
  User,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const initialUtilities = [
  {
    id: "focus",
    name: "Focus Timer",
    description: "Stay focused. Get more done.",
    status: "ready",
    icon: "timer",
    request:
      "Create a beautiful Focus Timer with Pomodoro, short breaks, and long breaks.",
  },
  {
    id: "renamer",
    name: "File Renamer",
    description: "Batch rename files quickly.",
    status: "ready",
    icon: "file",
    request: "Build a tool that renames a folder of images using a pattern.",
  },
  {
    id: "clipper",
    name: "Recipe Clipper",
    description: "Save recipes from any page.",
    status: "clarifying",
    icon: "list",
    request: "Make a desktop utility for collecting recipes from websites.",
  },
  {
    id: "tally",
    name: "Menu Bar Tally",
    description: "Track counts from anywhere.",
    status: "failed",
    icon: "trend",
    request: "Create a tiny menu bar tally counter with three named counters.",
  },
];

const statusCopy = {
  ready: "Ready",
  building: "Building",
  clarifying: "Needs input",
  failed: "Needs attention",
};

const planItems = [
  "Pomodoro timer with custom durations",
  "Short and long break cycles",
  "Clean interface with progress indicator",
  "Session history and statistics",
];

function UtilityGlyph({ kind, size = 28 }) {
  const Icon =
    kind === "file"
      ? FileText
      : kind === "list"
        ? ListChecks
        : kind === "trend"
          ? TrendUp
          : Timer;

  return <Icon size={size} weight="duotone" aria-hidden="true" />;
}

function StatusBadge({ status }) {
  const Icon =
    status === "ready"
      ? CheckCircle
      : status === "building"
        ? SpinnerGap
        : status === "failed"
          ? WarningCircle
          : Question;

  return (
    <span className={"status-badge status-" + status}>
      <Icon
        size={15}
        weight="bold"
        className={status === "building" ? "spin" : ""}
        aria-hidden="true"
      />
      {statusCopy[status]}
    </span>
  );
}

function Sidebar({
  utilities,
  activeId,
  onSelect,
  onNew,
  busy,
}) {
  return (
    <aside className="sidebar" aria-label="Utility library">
      <div className="window-controls" aria-hidden="true">
        <span className="control close" />
        <span className="control minimize" />
        <span className="control maximize" />
      </div>

      <div className="brand">
        <img src="/assets/replicator-icon.png" alt="" />
        <span>Replicator</span>
      </div>

      <div className="library-heading">
        <span>Utilities</span>
        <button className="new-utility" onClick={onNew} disabled={busy}>
          <Plus size={17} weight="bold" aria-hidden="true" />
          New Utility
        </button>
      </div>

      <nav className="utility-list" aria-label="Your Utilities">
        {utilities.map((utility) => {
          const selected = activeId === utility.id;
          return (
            <button
              key={utility.id}
              className={"utility-row " + (selected ? "selected" : "")}
              onClick={() => onSelect(utility.id)}
              aria-current={selected ? "page" : undefined}
            >
              <span className={"utility-icon utility-icon-" + utility.icon}>
                <UtilityGlyph kind={utility.icon} />
              </span>
              <span className="utility-copy">
                <strong>{utility.name}</strong>
                <span>{utility.description}</span>
                <StatusBadge status={utility.status} />
              </span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="owner-card">
          <span className="owner-avatar">S</span>
          <span>
            <small>Owned by</small>
            <strong>Somu</strong>
          </span>
          <DotsThree size={21} weight="bold" aria-hidden="true" />
        </div>
        <button className="settings-button">
          <Gear size={19} aria-hidden="true" />
          Settings
          <ArrowUp size={16} className="settings-arrow" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function TimelineItem({ actor, title, meta, children, tone = "default" }) {
  const isOwner = actor === "You";
  return (
    <article className={"timeline-item tone-" + tone}>
      <div className={"actor-node " + (isOwner ? "owner-node" : "claude-node")}>
        {isOwner ? (
          <User size={18} weight="fill" aria-hidden="true" />
        ) : (
          <Sparkle size={19} weight="fill" aria-hidden="true" />
        )}
      </div>
      <div className="timeline-card">
        <div className="timeline-meta">
          <strong>{actor}</strong>
          {meta && <span>{meta}</span>}
        </div>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </article>
  );
}

function ReadyTimeline({ utility, revision }) {
  return (
    <>
      <TimelineItem actor="You" title="Build Request" meta="Today at 9:41 AM">
        <p>{utility.request}</p>
      </TimelineItem>
      <TimelineItem actor="Claude" title="Plan" meta="Today at 9:42 AM">
        <ul className="plan-list">
          {planItems.map((item) => (
            <li key={item}>
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </TimelineItem>
      <TimelineItem
        actor="Claude"
        title="Build"
        meta="Today at 9:48 AM"
        tone="success"
      >
        <div className="result-line">
          <span>Built successfully.</span>
          <span className="success-pill">
            <CheckCircle size={16} weight="fill" aria-hidden="true" />
            Ready to launch
          </span>
        </div>
      </TimelineItem>
      <TimelineItem actor="You" title="Revision Request" meta="Today at 2:17 PM">
        <p>{revision || "Add a gentle sound when a focus session ends."}</p>
      </TimelineItem>
    </>
  );
}

function BuildingTimeline({ utility, onCancel }) {
  return (
    <>
      <TimelineItem actor="You" title="Build Request" meta="A few moments ago">
        <p>{utility.request}</p>
      </TimelineItem>
      <TimelineItem actor="Claude" title="Plan locked" meta="Completed">
        <p>
          I’ll build the smallest native Utility that handles the requested
          workflow and verify its critical behavior.
        </p>
      </TimelineItem>
      <TimelineItem actor="Claude" title="Building your Utility" tone="working">
        <div className="build-progress">
          <div className="progress-track">
            <span />
          </div>
          <ol>
            <li className="complete">
              <Check size={16} weight="bold" aria-hidden="true" />
              Creating the app
            </li>
            <li className="active">
              <SpinnerGap size={16} className="spin" aria-hidden="true" />
              Validating the build
            </li>
            <li>
              <Clock size={16} aria-hidden="true" />
              Preparing to launch
            </li>
          </ol>
          <button className="text-button danger" onClick={onCancel}>
            Cancel build
          </button>
        </div>
      </TimelineItem>
    </>
  );
}

function ClarificationTimeline({ utility, onContinue }) {
  const [choices, setChoices] = useState({
    storage: "",
    import: "",
  });
  const complete = choices.storage && choices.import;

  return (
    <>
      <TimelineItem actor="You" title="Build Request" meta="Today at 11:08 AM">
        <p>{utility.request}</p>
      </TimelineItem>
      <TimelineItem actor="Claude" title="Two quick choices" tone="question">
        <p className="clarification-intro">
          I need these answers before I can lock the plan.
        </p>
        <fieldset className="question-block">
          <legend>Where should saved recipes live?</legend>
          <div className="choice-row">
            {["Inside the Utility", "Markdown files"].map((choice) => (
              <button
                type="button"
                key={choice}
                className={choices.storage === choice ? "choice selected" : "choice"}
                onClick={() =>
                  setChoices((current) => ({ ...current, storage: choice }))
                }
              >
                {choices.storage === choice && (
                  <Check size={15} weight="bold" aria-hidden="true" />
                )}
                {choice}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="question-block">
          <legend>How should a recipe be added?</legend>
          <div className="choice-row">
            {["Paste a URL", "Paste recipe text"].map((choice) => (
              <button
                type="button"
                key={choice}
                className={choices.import === choice ? "choice selected" : "choice"}
                onClick={() =>
                  setChoices((current) => ({ ...current, import: choice }))
                }
              >
                {choices.import === choice && (
                  <Check size={15} weight="bold" aria-hidden="true" />
                )}
                {choice}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          className="primary compact"
          disabled={!complete}
          onClick={onContinue}
        >
          Continue
          <ArrowUp size={16} weight="bold" aria-hidden="true" />
        </button>
      </TimelineItem>
    </>
  );
}

function FailedTimeline({ utility, onRetry }) {
  return (
    <>
      <TimelineItem actor="You" title="Build Request" meta="Today at 12:04 PM">
        <p>{utility.request}</p>
      </TimelineItem>
      <TimelineItem actor="Claude" title="Build stopped" tone="error">
        <div className="failure">
          <WarningCircle size={22} weight="fill" aria-hidden="true" />
          <div>
            <strong>The Utility could not be prepared.</strong>
            <p>
              The source is saved. Retry starts a fresh attempt from the last
              safe point.
            </p>
          </div>
        </div>
        <button className="retry-button" onClick={onRetry}>
          <ArrowCounterClockwise size={17} weight="bold" aria-hidden="true" />
          Retry build
        </button>
      </TimelineItem>
    </>
  );
}

function CreateUtility({ onCreate, attachments, onAttach, onRemoveAttachment }) {
  const [prompt, setPrompt] = useState(
    "Build a simple clipboard history that lives in my menu bar.",
  );

  return (
    <div className="create-screen">
      <div className="create-orbit">
        <img src="/assets/replicator-icon.png" alt="" />
      </div>
      <h1>What do you want to make?</h1>
      <p>
        Describe a small desktop Utility. Replicator will ask if anything
        important is unclear.
      </p>
      <div className="create-composer">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          aria-label="Describe your Utility"
        />
        <div className="composer-actions">
          <button className="attach-button" onClick={onAttach}>
            <ImageSquare size={18} aria-hidden="true" />
            Reference Image
          </button>
          <button
            className="primary send-button"
            disabled={!prompt.trim()}
            onClick={() => onCreate(prompt)}
          >
            Build Utility
            <ArrowUp size={17} weight="bold" aria-hidden="true" />
          </button>
        </div>
        {attachments.length > 0 && (
          <div className="attachment-row">
            {attachments.map((attachment) => (
              <span className="attachment-chip" key={attachment}>
                <ImageSquare size={15} aria-hidden="true" />
                {attachment}
                <button
                  aria-label={"Remove " + attachment}
                  onClick={() => onRemoveAttachment(attachment)}
                >
                  <X size={13} weight="bold" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  attachments,
  onAttach,
  onRemoveAttachment,
  disabled,
}) {
  const inputRef = useRef(null);
  const send = () => {
    if (value.trim() && !disabled) onSend();
  };

  return (
    <div className={"composer " + (disabled ? "disabled" : "")}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          disabled
            ? "You can send another request when this build finishes."
            : "What would you like to change?"
        }
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          }
        }}
        aria-label="Revision request"
      />
      <div className="composer-footer">
        <div className="composer-left">
          <button onClick={onAttach} disabled={disabled}>
            <ImageSquare size={18} aria-hidden="true" />
            Reference Image
          </button>
          {attachments.map((attachment) => (
            <span className="attachment-chip" key={attachment}>
              {attachment}
              <button
                aria-label={"Remove " + attachment}
                onClick={() => onRemoveAttachment(attachment)}
              >
                <X size={12} weight="bold" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <button
          className="send-icon"
          onClick={send}
          disabled={disabled || !value.trim()}
          aria-label="Send revision"
        >
          <PaperPlaneTilt size={19} weight="fill" aria-hidden="true" />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [utilities, setUtilities] = useState(initialUtilities);
  const [activeId, setActiveId] = useState("focus");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [revision, setRevision] = useState("");
  const [notice, setNotice] = useState("");
  const timers = useRef([]);

  const selected = useMemo(
    () => utilities.find((utility) => utility.id === activeId),
    [utilities, activeId],
  );
  const busy = utilities.some((utility) => utility.status === "building");

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const updateStatus = (id, status) => {
    setUtilities((current) =>
      current.map((utility) =>
        utility.id === id ? { ...utility, status } : utility,
      ),
    );
  };

  const finishAfterDelay = (id, message) => {
    const timer = window.setTimeout(() => {
      updateStatus(id, "ready");
      setNotice(message);
    }, 1400);
    timers.current.push(timer);
  };

  const selectUtility = (id) => {
    setActiveId(id);
    setCreating(false);
    setDraft("");
    setAttachments([]);
    if (
      id === "renamer" &&
      utilities.find((utility) => utility.id === id)?.status === "ready"
    ) {
      updateStatus(id, "building");
    }
  };

  const attachReference = () => {
    if (!attachments.includes("timer-sketch.png")) {
      setAttachments((current) => [...current, "timer-sketch.png"]);
    }
  };

  const removeAttachment = (name) => {
    setAttachments((current) => current.filter((item) => item !== name));
  };

  const sendRevision = () => {
    if (!draft.trim() || !selected) return;
    setRevision(draft.trim());
    setDraft("");
    setAttachments([]);
    updateStatus(selected.id, "building");
    finishAfterDelay(selected.id, "Revision applied. Focus Timer is ready.");
  };

  const retry = () => {
    updateStatus(selected.id, "building");
    finishAfterDelay(selected.id, selected.name + " recovered and is ready.");
  };

  const createUtility = (prompt) => {
    const utility = {
      id: "clipboard",
      name: "Clipboard History",
      description: "Find anything you copied.",
      status: "building",
      icon: "list",
      request: prompt,
    };
    setUtilities((current) => [utility, ...current]);
    setActiveId(utility.id);
    setCreating(false);
    setAttachments([]);
    finishAfterDelay(utility.id, "Clipboard History is ready to launch.");
  };

  const launch = () => {
    setNotice(selected.name + " launched.");
  };

  return (
    <main className="app-shell">
      <Sidebar
        utilities={utilities}
        activeId={creating ? null : activeId}
        onSelect={selectUtility}
        onNew={() => {
          setCreating(true);
          setAttachments([]);
        }}
        busy={busy}
      />

      <section className="workspace">
        {creating ? (
          <CreateUtility
            onCreate={createUtility}
            attachments={attachments}
            onAttach={attachReference}
            onRemoveAttachment={removeAttachment}
          />
        ) : (
          <>
            <header className="workspace-header">
              <div className={"hero-icon utility-icon-" + selected.icon}>
                <UtilityGlyph kind={selected.icon} size={34} />
              </div>
              <div className="title-block">
                <div className="title-line">
                  <h1>{selected.name}</h1>
                  <StatusBadge status={selected.status} />
                </div>
                <p>{selected.description}</p>
              </div>
              <div className="header-actions">
                <button
                  className="primary launch-button"
                  onClick={launch}
                  disabled={selected.status !== "ready"}
                >
                  <Play size={19} weight="fill" aria-hidden="true" />
                  Launch
                </button>
                <button className="icon-button" aria-label="Utility actions">
                  <DotsThree size={24} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="timeline-scroll">
              <div className="timeline">
                {selected.status === "ready" && (
                  <ReadyTimeline utility={selected} revision={revision} />
                )}
                {selected.status === "building" && (
                  <BuildingTimeline
                    utility={selected}
                    onCancel={() => updateStatus(selected.id, "failed")}
                  />
                )}
                {selected.status === "clarifying" && (
                  <ClarificationTimeline
                    utility={selected}
                    onContinue={() => {
                      updateStatus(selected.id, "building");
                      finishAfterDelay(
                        selected.id,
                        "Recipe Clipper is ready to launch.",
                      );
                    }}
                  />
                )}
                {selected.status === "failed" && (
                  <FailedTimeline utility={selected} onRetry={retry} />
                )}
              </div>
            </div>

            <div className="composer-wrap">
              <Composer
                value={draft}
                onChange={setDraft}
                onSend={sendRevision}
                attachments={attachments}
                onAttach={attachReference}
                onRemoveAttachment={removeAttachment}
                disabled={busy || selected.status !== "ready"}
              />
            </div>
          </>
        )}
      </section>

      {notice && (
        <div className="toast" role="status">
          <CheckCircle size={19} weight="fill" aria-hidden="true" />
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}

      {import.meta.env.DEV && (
        <div className="prototype-note">
          Prototype · state lives in memory
        </div>
      )}
    </main>
  );
}
