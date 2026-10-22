import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictChip } from "./VerdictChip";
import { FieldLedger } from "./FieldLedger";
import { JsonEditor } from "./JsonEditor";
import { PerturbationBar } from "./PerturbationBar";

describe("VerdictChip", () => {
  it("differs by icon, word and colour class", () => {
    const { rerender } = render(<VerdictChip kind="accept" label="Accepted" />);
    const accept = screen.getByText("Accepted");
    expect(accept).toBeInTheDocument();
    expect(accept.parentElement).toHaveAttribute("data-kind", "accept");
    expect(screen.getByText("✓")).toBeInTheDocument();

    rerender(<VerdictChip kind="reject" label="Rejected" />);
    expect(screen.getByText("Rejected").parentElement).toHaveAttribute("data-kind", "reject");
    expect(screen.getByText("✕")).toBeInTheDocument();

    rerender(<VerdictChip kind="boundary" label="On the edge" />);
    expect(screen.getByText("On the edge").parentElement).toHaveAttribute(
      "data-kind",
      "boundary",
    );
    expect(screen.getByText("◆")).toBeInTheDocument();
  });
});

describe("FieldLedger", () => {
  it("separates compared fields from fields that are not compared", () => {
    render(
      <FieldLedger
        fields={[
          { name: "verdict", ok: true, reason: "OK" },
          { name: "band", ok: false, reason: "STEP_TOO_FAR" },
        ]}
        notCompared={["digest"]}
      />,
    );

    expect(screen.getByText("verdict")).toBeInTheDocument();
    expect(screen.getByText("band")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("STEP_TOO_FAR")).toBeInTheDocument();
    expect(screen.getByText("Not compared")).toBeInTheDocument();
    expect(screen.getByText(/digest/)).toBeInTheDocument();
  });
});

describe("JsonEditor", () => {
  it("shows valid JSON and refuses input over the limit", () => {
    const { rerender } = render(
      <JsonEditor label="Leader" value='{"a":1}' onChange={() => {}} />,
    );
    expect(screen.getByText("Valid JSON")).toBeInTheDocument();

    rerender(
      <JsonEditor label="Leader" value={"x".repeat(20000)} onChange={() => {}} />,
    );
    expect(
      screen.getByText("Input is larger than the allowed size. Shorten it to continue."),
    ).toBeInTheDocument();
  });

  it("flags invalid JSON", () => {
    render(<JsonEditor label="Leader" value="{not json" onChange={() => {}} />);
    expect(
      screen.getByText("This isn't valid JSON. Check the highlighted line."),
    ).toBeInTheDocument();
  });
});

describe("PerturbationBar", () => {
  it("shows the number and an icon on every bar", () => {
    render(
      <PerturbationBar label="Harmless accepted" accepted={10} rejected={0} total={10} />,
    );

    expect(screen.getByText("Harmless accepted")).toBeInTheDocument();
    expect(screen.getByText(/10\/10/)).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: /Harmless accepted: 10 of 10/ }),
    ).toBeInTheDocument();
  });
});
