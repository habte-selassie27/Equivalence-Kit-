import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TightnessScreen } from "./Tightness/TightnessScreen";
import { DecisionGuideScreen } from "./DecisionGuide/DecisionGuideScreen";
import { PatternsScreen } from "./Patterns/PatternsScreen";
import { PlaygroundScreen } from "./Playground/PlaygroundScreen";

function renderScreen(node: React.ReactElement, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{node}</MemoryRouter>);
}

describe("Patterns screen", () => {
  it("shows a pattern spec with its known limits expanded", () => {
    renderScreen(<PatternsScreen />);
    expect(screen.getByText("P1 Verdict plus band")).toBeInTheDocument();
    expect(screen.getByText("Known limits")).toBeInTheDocument();
    expect(
      screen.getByText(/Cannot detect a consistently wrong verdict shared by every validator/),
    ).toBeInTheDocument();
  });

  it("lists the acceptance matrix with boundary cases highlighted", () => {
    const { container } = renderScreen(<PatternsScreen />);
    const boundary = container.querySelectorAll('tr[data-boundary="true"]');
    expect(boundary.length).toBeGreaterThan(0);
  });
});

describe("Tightness screen", () => {
  it("shows the harmless and harmful rates with numbers", () => {
    renderScreen(<TightnessScreen />);
    expect(screen.getByText("Harmless variations accepted")).toBeInTheDocument();
    expect(screen.getByText("Harmful variations rejected")).toBeInTheDocument();
    expect(screen.getAllByText(/60\/60/).length).toBeGreaterThan(0);
  });

  it("reports no gaps when both rates are complete", () => {
    renderScreen(<TightnessScreen />);
    expect(
      screen.getByText(
        "No gaps found. Harmless variations are accepted and harmful ones are rejected.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Decision guide screen", () => {
  it("walks through the eight questions in order", () => {
    renderScreen(<DecisionGuideScreen />);
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(8);
    expect(
      screen.getByText(/Can validators reproduce the same normalized output/),
    ).toBeInTheDocument();
  });

  it("offers a way to try the recommended pattern", async () => {
    const { fireEvent } = await import("@testing-library/react");
    renderScreen(<DecisionGuideScreen />);

    // Question 1 has no pattern recommendation; open question 2, which does.
    fireEvent.click(screen.getByRole("button", { name: /What kind of output is it/ }));

    const buttons = screen.getAllByRole("button", { name: /Try P/ });
    expect(buttons.length).toBeGreaterThan(0);
  });
});

describe("Playground screen", () => {
  it("loads a stored case and labels the stored result", () => {
    renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    expect(screen.getByText("Leader output (JSON)")).toBeInTheDocument();
    expect(screen.getByText(/stored result from the acceptance matrix/)).toBeInTheDocument();
  });

  it("blocks a run when the editor holds invalid JSON", async () => {
    const { container } = renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    const editor = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(editor).toBeTruthy();

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(editor, { target: { value: "{not json" } });

    const run = screen.getByRole("button", { name: "Run comparison" });
    fireEvent.click(run);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/isn't valid JSON/)).toBeInTheDocument();
  });

  it("shows the known-limits honesty line", () => {
    renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    expect(
      screen.getAllByText(
        /These rules show how validators agree. They do not check whether content is true/,
      ).length,
    ).toBeGreaterThan(0);
  });
});
