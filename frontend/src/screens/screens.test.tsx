import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomeScreen } from "./Home/HomeScreen";
import { TightnessScreen } from "./Tightness/TightnessScreen";
import { DecisionGuideScreen } from "./DecisionGuide/DecisionGuideScreen";
import { PatternsScreen } from "./Patterns/PatternsScreen";
import { PlaygroundScreen } from "./Playground/PlaygroundScreen";
import { DevelopersGuideScreen } from "./DevelopersGuide/DevelopersGuideScreen";

function renderScreen(node: React.ReactElement, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{node}</MemoryRouter>);
}

async function fireEvent() {
  return (await import("@testing-library/react")).fireEvent;
}

describe("Patterns screen", () => {
  it("shows a pattern spec with its known limits expanded", () => {
    renderScreen(<PatternsScreen />);
    // The pattern name appears in the list and again in the spec heading.
    expect(screen.getAllByText("Verdict plus band").length).toBeGreaterThan(0);
    expect(screen.getByText("Known limits")).toBeInTheDocument();
    expect(
      screen.getByText(/Cannot detect a consistently wrong verdict/),
    ).toBeInTheDocument();
  });

  it("preselects the pattern named in the URL", () => {
    renderScreen(<PatternsScreen />, "/?pattern=P3");
    expect(
      screen.getByText(/value must be at least 0/),
    ).toBeInTheDocument();
  });

  it("lists the acceptance matrix with boundary cases highlighted", () => {
    const { container } = renderScreen(<PatternsScreen />);
    const boundary = container.querySelectorAll('tr[data-boundary="true"]');
    expect(boundary.length).toBeGreaterThan(0);
  });

  it("shows parameters in plain terms with the values the matrix exercises", () => {
    renderScreen(<PatternsScreen />, "/?pattern=P3");
    expect(
      screen.getByText(/within 100 or 10000 basis points/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/also exercised:/).length).toBeGreaterThan(0);
  });

  it("switches specs and resets the matrix filter when another pattern is selected", async () => {
    const user = await fireEvent();
    renderScreen(<PatternsScreen />);

    const filter = screen.getByLabelText("Show") as HTMLSelectElement;
    user.change(filter, { target: { value: "BOUNDARY" } });
    expect(filter.value).toBe("BOUNDARY");

    user.click(screen.getByRole("button", { name: /^P2/ }));
    expect(
      screen.getByRole("heading", { name: "Fact set", level: 3 }),
    ).toBeInTheDocument();
    expect((screen.getByLabelText("Show") as HTMLSelectElement).value).toBe("ALL");
  });

  it("opens the playground with the chosen case", async () => {
    const user = await fireEvent();
    const { container } = render(
      <MemoryRouter initialEntries={["/?pattern=P3"]}>
        <Routes>
          <Route path="/" element={<PatternsScreen />} />
          <Route path="/playground" element={<PlaygroundScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    // Two tables render (fields and the acceptance matrix); scope to the matrix one.
    const matrixTable = container.querySelector("table.matrix");
    expect(matrixTable).toBeTruthy();
    const tryItButtons = within(matrixTable as HTMLElement).getAllByRole("button", {
      name: "Try in playground",
    });
    const tryIt = tryItButtons[0];
    if (tryIt) {
      user.click(tryIt);
    }
    expect(await screen.findByText("Leader output (JSON)")).toBeInTheDocument();
    expect(screen.getByText("Context (JSON)")).toBeInTheDocument();
  });
});

describe("Tightness screen", () => {
  it("shows the harmless and harmful rates with numbers", () => {
    renderScreen(<TightnessScreen />);
    expect(screen.getByText("Harmless variations accepted")).toBeInTheDocument();
    expect(screen.getByText("Harmful variations rejected")).toBeInTheDocument();
    expect(screen.getAllByText(/60\/60/).length).toBeGreaterThan(0);
  });

  it("never describes harmful rejections as acceptance", () => {
    renderScreen(<TightnessScreen />);
    expect(screen.getAllByText(/rejected, 0 accepted/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/accepted, 0 rejected/).length).toBeGreaterThan(0);
  });

  it("reports no gaps when both rates are complete", () => {
    renderScreen(<TightnessScreen />);
    expect(
      screen.getByText(
        "No gaps found. Harmless variations are accepted and harmful ones are rejected.",
      ),
    ).toBeInTheDocument();
  });

  it("explains how to read the report", () => {
    renderScreen(<TightnessScreen />);
    expect(screen.getByText("How to read this")).toBeInTheDocument();
  });

  it("summarizes the parameters in force and links boundary cases", () => {
    renderScreen(<TightnessScreen />);
    expect(screen.getAllByText(/^Parameters:/).length).toBeGreaterThan(0);
    const links = screen.getAllByRole("link", { name: "Try in playground" });
    expect(links.length).toBeGreaterThan(0);
  });
});

describe("Decision guide screen", () => {
  it("starts at question 1 with its options", () => {
    renderScreen(<DecisionGuideScreen />);
    expect(screen.getByText(/Question 1 of 8/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Yes, code decides everything/ }),
    ).toBeInTheDocument();
  });

  it("advances to the next question when an answer is chosen", async () => {
    const user = await fireEvent();
    renderScreen(<DecisionGuideScreen />);
    user.click(screen.getByRole("button", { name: /Partly — the model or the web/ }));
    expect(await screen.findByText(/Question 2 of 8/)).toBeInTheDocument();
  });

  it("keeps a running summary of the answers given", async () => {
    const user = await fireEvent();
    const { container } = renderScreen(<DecisionGuideScreen />);
    user.click(screen.getByRole("button", { name: /Partly — the model or the web/ }));
    // The summary shows the chosen label; the rest stay "not answered".
    const aside = container.querySelector(".guide-summary");
    expect(aside).toBeTruthy();
    await waitFor(() => {
      expect(within(aside as HTMLElement).getAllByText(/Partly — the model or the web/).length).toBeGreaterThan(0);
    });
    expect(within(aside as HTMLElement).getAllByText(/not answered/).length).toBeGreaterThan(0);
  });

  it("reaches a recommendation after eight answers and links to the playground", async () => {
    const user = await fireEvent();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<DecisionGuideScreen />} />
          <Route path="/playground" element={<PlaygroundScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    for (let question = 1; question <= 8; question += 1) {
      void question;
      const options = screen
        .getAllByRole("button")
        .filter((button) => button.closest(".guide-option") !== null);
      const first = options[0];
      if (first) user.click(first);
    }
    expect(await screen.findByText("Recommendation")).toBeInTheDocument();
    const tryIt = screen.getByRole("button", { name: /Try P\d in the playground/ });
    user.click(tryIt);
    expect(await screen.findByText("Leader output (JSON)")).toBeInTheDocument();
  });

  it("allows stepping back and shows the earlier question again", async () => {
    const user = await fireEvent();
    renderScreen(<DecisionGuideScreen />);
    user.click(screen.getByRole("button", { name: /Partly — the model or the web/ }));
    await screen.findByText(/Question 2 of 8/);
    user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText(/Question 1 of 8/)).toBeInTheDocument();
  });

  it("jumps between questions from the rail and the stepper", async () => {
    const user = await fireEvent();
    renderScreen(<DecisionGuideScreen />);
    // A rail row opens that question directly.
    user.click(
      screen.getByRole("button", {
        name: /^5\. What must never change the decision\?/,
      }),
    );
    expect(await screen.findByText(/Question 5 of 8/)).toBeInTheDocument();
    // A stepper dot jumps back.
    user.click(
      screen.getByRole("button", {
        name: /Question 2: What shape is the non-deterministic output\?/,
      }),
    );
    expect(await screen.findByText(/Question 2 of 8/)).toBeInTheDocument();
  });

  it("links the finished recommendation to the patterns route", async () => {
    const user = await fireEvent();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<DecisionGuideScreen />} />
          <Route path="/patterns" element={<PatternsScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    for (let question = 1; question <= 8; question += 1) {
      const options = screen
        .getAllByRole("button")
        .filter((button) => button.closest(".guide-option") !== null);
      user.click(options[0] as HTMLElement);
    }
    expect(await screen.findByText("Recommendation")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Read the pattern spec" }));
    // The patterns screen shows the P1 spec; "Known limits" exists only there.
    expect(await screen.findByText("Known limits")).toBeInTheDocument();
  });
});

describe("Playground screen", () => {
  it("loads a stored case and labels the stored result", () => {
    renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    expect(screen.getByText("Leader output (JSON)")).toBeInTheDocument();
    expect(screen.getByText(/stored result from the acceptance matrix/)).toBeInTheDocument();
  });

  it("blocks a run when the editor holds invalid JSON", async () => {
    const user = await fireEvent();
    const { container } = renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    const editor = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(editor).toBeTruthy();

    user.change(editor, { target: { value: "{not json" } });

    // The run button refuses to start, and the editor status carries the copy-deck
    // message: an invalid comparison never runs (UI.md 8.3 step 1).
    const run = screen.getByRole("button", { name: "Run comparison" }) as HTMLButtonElement;
    expect(run).toBeDisabled();
    expect(screen.getAllByText(/isn't valid JSON/).length).toBeGreaterThan(0);
  });

  it("groups the case dropdown by category and shows the context editor", () => {
    const { container } = renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    const groups = container.querySelectorAll("#pg-case optgroup");
    expect(groups.length).toBe(3);
    expect(screen.getByText("Context (JSON)")).toBeInTheDocument();
  });

  it("exposes the perturbation seed as a bounded integer input", () => {
    renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    const seed = screen.getByLabelText("Seed") as HTMLInputElement;
    expect(seed.min).toBe("0");
    expect(Number(seed.value)).toBe(0);
  });

  it("shows the editor size against its cap", () => {
    const { container } = renderScreen(<PlaygroundScreen />, "/playground?pattern=P1");
    // The P1 case text is short; the counter must show the cap alongside it.
    expect(container.textContent).toMatch(/of 16,384 characters/);
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

describe("Home screen", () => {
  it("leads with the problem and the six patterns as links", () => {
    renderScreen(<HomeScreen />);
    expect(
      screen.getByText(/deciding what validators must agree on/),
    ).toBeInTheDocument();
    for (const id of ["P1", "P2", "P3", "P4", "P5", "P6"]) {
      expect(screen.getAllByText(id).length).toBeGreaterThan(0);
    }
  });

  it("renders tightness numbers from the generated data, not literals", () => {
    renderScreen(<HomeScreen />);
    expect(
      screen.getByText(/60\/60 harmless variations accepted/),
    ).toBeInTheDocument();
  });

  it("links into the playground and the developer's guide", () => {
    const { container } = renderScreen(<HomeScreen />);
    const hrefs = container.querySelectorAll("a[href]");
    const targets = Array.from(hrefs).map((a) => a.getAttribute("href"));
    expect(targets).toContain("/guide");
    expect(targets).toContain("/developing");
    expect(targets).toContain("/playground");
    expect(targets).toContain("/patterns?pattern=P1");
  });
});

describe("Developer's guide screen", () => {
  it("documents the shipped CLI commands", () => {
    renderScreen(<DevelopersGuideScreen />);
    expect(screen.getByText(/ekit --version/)).toBeInTheDocument();
    expect(screen.getByText(/ekit audit contracts --sarif audit\.sarif/)).toBeInTheDocument();
    expect(screen.getByText(/ekit tighten --init/)).toBeInTheDocument();
    expect(screen.getByText(/python3\.12 tools\/vendor\.py --check/)).toBeInTheDocument();
  });

  it("states the vendoring reason and the pinned interpreter", () => {
    const { container } = renderScreen(<DevelopersGuideScreen />);
    expect(container.textContent).toMatch(/cannot import a sibling module/);
    expect(container.textContent).toMatch(/usr\/bin\/python3\.12|Python 3\.12/);
  });

  it("walks the contract-recipe in order", () => {
    renderScreen(<DevelopersGuideScreen />);
    expect(screen.getByText(/1 · Install from the source tree/)).toBeInTheDocument();
    expect(screen.getByText(/6 · Verify before you ship/)).toBeInTheDocument();
  });
});
