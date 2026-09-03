// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  CommunityDisclaimer,
  Empty,
  ErrorBox,
  Loading,
  Pagination,
  ReadView,
  StatusBadge,
  Unconfigured,
} from "../components/ui";
import type { ReadState } from "../hooks/useRead";

function state<T>(over: Partial<ReadState<T>>): ReadState<T> {
  return {
    data: null,
    loading: false,
    error: null,
    unconfigured: false,
    loadedAt: null,
    reload: () => {},
    ...over,
  };
}

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("read states", () => {
  it("shows an unconfigured contract as unconfigured, not as empty", () => {
    wrap(
      <ReadView state={state({ unconfigured: true })} what="protocols">
        {() => <div>rows</div>}
      </ReadView>,
    );
    expect(screen.getByText(/No contract address configured/i)).toBeInTheDocument();
    expect(screen.getByText(/not an empty registry/i)).toBeInTheDocument();
    expect(screen.queryByText("rows")).not.toBeInTheDocument();
  });

  it("shows loading before data", () => {
    wrap(
      <ReadView state={state({ loading: true })} what="protocols">
        {() => <div>rows</div>}
      </ReadView>,
    );
    expect(screen.getByText(/Loading protocols/i)).toBeInTheDocument();
  });

  it("shows a read error instead of stale or empty content", () => {
    wrap(
      <ReadView state={state({ error: "[RULE_NOT_FOUND] r_9" })} what="rule">
        {() => <div>rows</div>}
      </ReadView>,
    );
    expect(screen.getByText(/Could not read the contract/i)).toBeInTheDocument();
    expect(screen.getByText(/RULE_NOT_FOUND/)).toBeInTheDocument();
    expect(screen.queryByText("rows")).not.toBeInTheDocument();
  });

  it("distinguishes a genuinely empty list from a missing one", () => {
    wrap(
      <ReadView state={state<string[]>({ data: [] })} what="cases" empty="No cases yet.">
        {() => <div>rows</div>}
      </ReadView>,
    );
    expect(screen.getByText("No cases yet.")).toBeInTheDocument();
  });

  it("renders data when present", () => {
    wrap(
      <ReadView state={state<string[]>({ data: ["a"] })} what="cases">
        {(rows) => <div>{rows.length} row</div>}
      </ReadView>,
    );
    expect(screen.getByText("1 row")).toBeInTheDocument();
  });
});

describe("presentation", () => {
  it("always states that a Rulebook is community maintained", () => {
    wrap(<CommunityDisclaimer />);
    expect(screen.getByText(/Community-maintained/i)).toBeInTheDocument();
    expect(screen.getByText(/not affiliated with or endorsed by/i)).toBeInTheDocument();
  });

  it("renders status vocabulary readably", () => {
    wrap(<StatusBadge status="SNAPSHOT_COMPLETE" />);
    expect(screen.getByText("SNAPSHOT COMPLETE")).toBeInTheDocument();
  });

  it("hides pagination when there is only one page", () => {
    const { container } = wrap(
      <Pagination offset={0} size={20} count={3} onChange={() => {}} />,
    );
    expect(container.querySelector(".pagination")).toBeNull();
  });

  it("offers a next page only when the page came back full", () => {
    wrap(<Pagination offset={0} size={20} count={20} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("renders the other primitives", () => {
    wrap(
      <>
        <Loading what="rules" />
        <Empty>nothing here</Empty>
        <ErrorBox message="boom" />
        <Unconfigured />
      </>,
    );
    expect(screen.getByText(/Loading rules/)).toBeInTheDocument();
    expect(screen.getByText("nothing here")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
