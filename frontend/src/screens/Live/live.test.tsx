/**
 * The Live screen is the only screen that touches the chain, so its tests mock the
 * bridge module (`lib/genlayer`) and drive the lifecycle directly. What is under test
 * here is the UI contract: it calls the deployed method with the right arguments, it
 * never claims a write landed before the receipt says so, and it fails loudly when the
 * wallet or the JSON is not usable.
 *
 * The deployment registry itself stays real (importActual), so these tests also pin
 * that the screen is wired to the addresses recorded in `deployments/studionet.md`.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEPLOYMENTS,
  connectWallet,
  explorerTxUrl,
  getEthereum,
  readView,
  submitRecordWrite,
  type TxState,
} from "../../lib/genlayer";
import { LiveScreen } from "./LiveScreen";

vi.mock("../../lib/genlayer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/genlayer")>();
  return {
    ...actual,
    readView: vi.fn(),
    connectWallet: vi.fn(),
    submitRecordWrite: vi.fn(),
    getEthereum: vi.fn(),
  };
});

const verdictJudge = DEPLOYMENTS[0]!;

function setEthereum(provider: unknown) {
  Object.defineProperty(window, "ethereum", {
    value: provider,
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setEthereum(undefined);
  vi.mocked(readView).mockResolvedValue({ bands: ["LOW", "MEDIUM", "HIGH"], judgments_created: 1 });
  vi.mocked(getEthereum).mockReturnValue(null);
});

describe("LiveScreen reads", () => {
  it("calls the deployed contract's config view on arrival, with no wallet", async () => {
    render(<LiveScreen />);

    await waitFor(() =>
      expect(readView).toHaveBeenCalledWith(verdictJudge, "get_config", []),
    );
    const result = await screen.findByTestId("read-result");
    expect(result).toHaveTextContent("judgments_created");
  });

  it("passes typed arguments through to the selected view method", async () => {
    vi.mocked(readView).mockResolvedValue({ judgment_id: 3, status: "OPEN" });
    const user = userEvent.setup();
    render(<LiveScreen />);
    await screen.findByTestId("read-result");

    await user.selectOptions(screen.getByLabelText("View method"), "get_judgment");
    await user.clear(screen.getByLabelText("judgment_id"));
    await user.type(screen.getByLabelText("judgment_id"), "3");
    await user.click(screen.getByRole("button", { name: "Run read" }));

    await waitFor(() =>
      expect(readView).toHaveBeenCalledWith(verdictJudge, "get_judgment", [3]),
    );
    expect(await screen.findByTestId("read-result")).toHaveTextContent('"status": "OPEN"');
  });

  it("switches the read target with the contract tabs", async () => {
    const user = userEvent.setup();
    render(<LiveScreen />);
    await screen.findByTestId("read-result");

    await user.click(screen.getByRole("tab", { name: /WebFactAttestor/ }));

    await waitFor(() =>
      expect(readView).toHaveBeenCalledWith(DEPLOYMENTS[1], "get_config", []),
    );
    // The attestation view is now offered, the judgment view is not.
    const select = screen.getByLabelText("View method");
    expect(within(select).getByRole("option", { name: "get_latest_attestation" })).toBeTruthy();
    expect(within(select).queryByRole("option", { name: "get_judgment" })).toBeNull();
  });

  it("shows a failed read as an error instead of an empty result", async () => {
    vi.mocked(readView).mockRejectedValue(new Error("RPC busy"));
    render(<LiveScreen />);

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("RPC busy");
    expect(screen.queryByTestId("read-result")).toBeNull();
  });
});

describe("LiveScreen writes", () => {
  it("reports no wallet without blocking reads", async () => {
    render(<LiveScreen />);
    await screen.findByTestId("read-result");

    expect(screen.getByText("No browser wallet detected")).toBeTruthy();
    expect(screen.getByText(/Reads above work without one/)).toBeTruthy();
  });

  it("connects the wallet and reports the connected address", async () => {
    vi.mocked(connectWallet).mockResolvedValue({
      status: "connected",
      address: "0x5B3661C576c7001e6d6279C67F3779705d334c89",
    });
    const user = userEvent.setup();
    render(<LiveScreen />);
    await screen.findByTestId("read-result");

    await user.click(screen.getByRole("button", { name: "Connect wallet" }));

    await waitFor(() => expect(connectWallet).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Wallet connected")).toBeTruthy();
    expect(screen.getByText(/0x5B36…4c89/)).toBeTruthy();
  });

  it("blocks a write whose JSON argument is not parseable", async () => {
    vi.mocked(connectWallet).mockResolvedValue({ status: "connected", address: "0xabc" });
    const user = userEvent.setup();
    render(<LiveScreen />);
    await screen.findByTestId("read-result");
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByText("Wallet connected");

    await user.clear(screen.getByLabelText("rubric_json"));
    // Unquoted text is not valid JSON, and the contract would revert on it too.
    await user.type(screen.getByLabelText("rubric_json"), "not json");

    expect(await screen.findByText("rubric_json is not valid JSON yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send create_judgment" })).toBeDisabled();
  });

  it("walks the full transaction lifecycle and reads the record back", async () => {
    vi.mocked(connectWallet).mockResolvedValue({ status: "connected", address: "0xabc" });
    const hash = "0xdeadbeef";
    const record = {
      judgment_id: 1,
      status: "OPEN",
      title: "Income eligibility",
      verdict_set: ["ELIGIBLE", "INELIGIBLE"],
    };
    vi.mocked(submitRecordWrite).mockImplementation(async (_d, _m, _args, onState) => {
      const states: TxState[] = [
        { phase: "signing" },
        { phase: "submitted", hash, statusName: "SUBMITTED" },
        { phase: "tracking", hash, statusName: "PROPOSING" },
        {
          phase: "finalized",
          hash,
          statusName: "FINALIZED",
          votes: ["AGREE", "AGREE", "IDLE"],
          consensusResult: "MAJORITY_AGREE",
          execution: "FINISHED_WITH_RETURN",
          rounds: "1",
          recordId: 1,
          readBack: record,
        },
      ];
      for (const state of states) onState(state);
      return states[states.length - 1]!;
    });

    const user = userEvent.setup();
    render(<LiveScreen />);
    await screen.findByTestId("read-result");
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));
    await user.click(screen.getByRole("button", { name: "Send create_judgment" }));

    // The hash is linked to the explorer the moment the network accepts it, and the
    // write is only called final after the receipt.
    const txLink = await screen.findByRole("link", { name: hash });
    expect(txLink).toHaveAttribute("href", explorerTxUrl(hash));
    expect(await screen.findByText("Finalized after 1 round(s).")).toBeTruthy();

    // The validator votes and the consensus outcome are shown separately from the
    // execution result, because a transaction can be accepted and still fail to execute.
    const votes = screen.getByLabelText("Validator votes");
    expect(within(votes).getAllByText("AGREE")).toHaveLength(2);
    expect(screen.getByText("MAJORITY_AGREE")).toBeTruthy();
    expect(screen.getByText("FINISHED_WITH_RETURN")).toBeTruthy();
    expect(screen.getByText(/Consensus says validators accepted/)).toBeTruthy();

    // The record read back from the chain proves the write landed.
    expect(
      await screen.findByText(/get_judgment\(1\)/),
    ).toBeTruthy();
    expect(screen.getByText(/"title": "Income eligibility"/)).toBeTruthy();

    // The arguments sent were the form's values, in schema order.
    const [, , args] = vi.mocked(submitRecordWrite).mock.calls[0]!;
    expect(args[0]).toBe("Income eligibility");
    expect(args[1]).toBe("ELIGIBLE,INELIGIBLE");
  });

  it("shows a declined signature as a failure, not as pending", async () => {
    vi.mocked(connectWallet).mockResolvedValue({ status: "connected", address: "0xabc" });
    vi.mocked(submitRecordWrite).mockImplementation(async (_d, _m, _args, onState) => {
      const state: TxState = { phase: "failed", error: "User rejected the request." };
      onState(state);
      return state;
    });
    const user = userEvent.setup();
    render(<LiveScreen />);
    await screen.findByTestId("read-result");
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));
    await user.click(screen.getByRole("button", { name: "Send create_judgment" }));

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("User rejected the request.");
    // A declined signature is never presented as a finality or a record.
    expect(screen.queryByText(/Finalized after/)).toBeNull();
    expect(screen.queryByText(/get_judgment\(/)).toBeNull();
  });
});
