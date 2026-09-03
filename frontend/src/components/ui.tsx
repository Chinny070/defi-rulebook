import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CHAIN_NAME } from "../lib/config";
import { shortHash } from "../lib/format";
import type { ReadState } from "../hooks/useRead";

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`badge badge-${kind.toLowerCase()}`}>{children}</span>;
}

/** Status vocabulary rendered consistently everywhere. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    ESTABLISHED: "good",
    FINALIZED: "good",
    CURRENT: "good",
    ACTIVE: "good",
    SNAPSHOT_COMPLETE: "good",
    SETTLED: "good",
    REFUNDABLE: "good",
    NOT_ESTABLISHED: "bad",
    REJECTED: "bad",
    SNAPSHOT_FAILED: "bad",
    SLASHABLE: "bad",
    INVALIDATED: "bad",
    ABANDONED: "muted",
    SUPERSEDED: "muted",
    UNVERIFIED: "muted",
    UNSNAPSHOTTED: "muted",
    NONE: "muted",
    DISPUTED: "warn",
    CHALLENGED: "warn",
    UNDETERMINED: "warn",
    OPEN: "warn",
  };
  return <Badge kind={tone[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

export function Loading({ what = "data" }: { what?: string }) {
  return <p className="muted">Loading {what}...</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="panel error">
      <strong>Could not read the contract.</strong>
      <p className="mono small">{message}</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

/** Shown whenever no contract address is configured. */
export function Unconfigured() {
  return (
    <div className="panel warn">
      <strong>No contract address configured.</strong>
      <p>
        The Rule Explorer reads directly from a deployed DEFI RULEBOOK contract on{" "}
        <code>{CHAIN_NAME}</code>. Set <code>VITE_CONTRACT_ADDRESS</code> to the deployed
        address and reload.
      </p>
      <p className="muted small">
        This is not an empty registry - nothing has been read at all.
      </p>
    </div>
  );
}

/** Renders the four states of a read, so a screen never invents a fifth. */
export function ReadView<T>({
  state,
  what,
  children,
  empty,
}: {
  state: ReadState<T>;
  what: string;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
}) {
  if (state.unconfigured) return <Unconfigured />;
  if (state.loading) return <Loading what={what} />;
  if (state.error) return <ErrorBox message={state.error} />;
  if (state.data === null) return <Empty>{empty ?? `No ${what} found.`}</Empty>;
  if (Array.isArray(state.data) && state.data.length === 0) {
    return <Empty>{empty ?? `No ${what} yet.`}</Empty>;
  }
  return <>{children(state.data)}</>;
}

export function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </div>
  );
}

export function Panel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      {title && (
        <header className="panel-head">
          <h2>{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pagination({
  offset,
  size,
  count,
  onChange,
}: {
  offset: number;
  size: number;
  count: number;
  onChange: (next: number) => void;
}) {
  const hasPrev = offset > 0;
  const hasNext = count === size;
  if (!hasPrev && !hasNext) return null;
  return (
    <div className="pagination">
      <button disabled={!hasPrev} onClick={() => onChange(Math.max(0, offset - size))}>
        Previous
      </button>
      <span className="muted small">
        showing {count} from #{offset + 1}
      </span>
      <button disabled={!hasNext} onClick={() => onChange(offset + size)}>
        Next
      </button>
    </div>
  );
}

/**
 * Mandatory on every protocol surface. A community Rulebook must never be
 * mistaken for an official one.
 */
export function CommunityDisclaimer() {
  return (
    <p className="disclaimer">
      Community-maintained. Not affiliated with or endorsed by the protocol team. Rules
      reflect adjudicated public evidence, not protocol endorsement.
    </p>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="mono">{children}</code>;
}

export function Hash({ value }: { value: string | undefined }) {
  if (!value) return <span className="muted">-</span>;
  return (
    <code className="mono" title={value}>
      {shortHash(value)}
    </code>
  );
}

export function CaseLink({ id }: { id: string }) {
  if (!id) return <span className="muted">-</span>;
  return <Link to={`/case/${id}`}>{id}</Link>;
}
