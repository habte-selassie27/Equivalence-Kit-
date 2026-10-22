import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToleranceTrack, type TrackSpec, type TrackResult } from "./ToleranceTrack";

function renderTrack(spec: TrackSpec, result: TrackResult) {
  return render(<ToleranceTrack spec={spec} result={result} />);
}

describe("ToleranceTrack", () => {
  it("renders an enum track with both marks and a text alternative", () => {
    renderTrack(
      {
        kind: "enum",
        levels: ["ELIGIBLE", "INELIGIBLE"],
        leader: "ELIGIBLE",
        validator: "ELIGIBLE",
      },
      { accepted: true, onEdge: false, summary: "Leader ELIGIBLE, validator ELIGIBLE." },
    );

    expect(screen.getByText("ELIGIBLE")).toBeInTheDocument();
    expect(screen.getByText(/Leader ELIGIBLE, validator ELIGIBLE/)).toBeInTheDocument();
  });

  it("renders an ordinal track with a hatched region for the allowed steps", () => {
    const { container } = renderTrack(
      {
        kind: "ordinal",
        levels: ["LOW", "MEDIUM", "HIGH"],
        leader: "MEDIUM",
        validator: "HIGH",
        maxSteps: 1,
      },
      { accepted: true, onEdge: true, summary: "Leader MEDIUM, validator HIGH." },
    );

    expect(screen.getByText(/allowed distance 1 step/i)).toBeInTheDocument();
    expect(container.querySelectorAll('.track-slot[data-region="true"]').length).toBeGreaterThan(0);
  });

  it("renders a numeric track with integer band labels", () => {
    renderTrack(
      {
        kind: "number",
        leader: 100,
        validator: 101,
        min: 0,
        max: 200,
        toleranceBps: 100,
      },
      { accepted: true, onEdge: false, summary: "Leader 100, validator 101." },
    );

    expect(screen.getByText("leader 100")).toBeInTheDocument();
    expect(screen.getByText("validator 101")).toBeInTheDocument();
    expect(screen.getByText(/Leader 100, validator 101/)).toBeInTheDocument();
  });

  it("renders a bucket track with boundary labels", () => {
    renderTrack(
      { kind: "bucket", edges: [10, 100], leader: 1, validator: 1 },
      { accepted: true, onEdge: false, summary: "Leader in bucket 1, validator in bucket 1." },
    );

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("marks ids outside the universe as not provided", () => {
    renderTrack(
      {
        kind: "set",
        leader: ["a", "ghost"],
        validator: ["a"],
        universe: ["a", "b"],
      },
      { accepted: false, onEdge: false, summary: "Leader lists a, ghost; validator lists a." },
    );

    // One chip note for the id outside the universe, plus the summary line.
    expect(screen.getAllByText(/not provided/).length).toBeGreaterThan(0);
    expect(screen.getByText("ghost")).toBeInTheDocument();
  });

  it("marks ranking chips past the top-k cutoff", () => {
    const { container } = renderTrack(
      {
        kind: "ranking",
        leader: ["a", "b", "c"],
        validator: ["a", "b", "c"],
        k: 2,
        universe: ["a", "b", "c"],
      },
      { accepted: true, onEdge: false, summary: "Top 2." },
    );

    // One chip past the cutoff in each of the two rows.
    expect(container.querySelectorAll('.rank-chip[data-cutoff="true"]').length).toBe(2);
  });

  it("shows the source as its own position on a boolean track", () => {
    renderTrack(
      { kind: "boolean", leader: "UNAVAILABLE", validator: false },
      { accepted: false, onEdge: false, summary: "Leader says source unavailable." },
    );

    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Leader says source unavailable/)).toBeInTheDocument();
  });

  it("always provides a text alternative, never relying on the drawing alone", () => {
    const { container } = renderTrack(
      {
        kind: "enum",
        levels: ["A", "B"],
        leader: "A",
        validator: "B",
      },
      { accepted: false, onEdge: false, summary: "Leader A, validator B." },
    );

    expect(container.querySelector("figcaption")?.textContent).toContain("Leader A");
  });
});
