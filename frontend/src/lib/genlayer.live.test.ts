/**
 * Live wallet-path check — the one test that drives the real bridge against StudioNet.
 *
 * Everything here is real except the wallet UI: the SDK, the RPC, the deployed
 * VerdictJudge contract, the consensus round, the receipt, and the read-back all come
 * from the network. The wallet itself is replaced by the smallest possible EIP-1193
 * provider — a locally generated key that forwards plain RPC reads to the network and
 * asks the same SDK to broadcast the signed transaction. That is the same seam a
 * browser wallet occupies: the code under test (`connectWallet`, `submitRecordWrite`,
 * the receipt decoding, the read-back) is untouched.
 *
 * Skipped by default because it writes to a live network and waits out a real
 * consensus round plus a persistence settling window (a few minutes). Run it with:
 *
 *     RUN_LIVE=1 npx vitest run src/lib/genlayer.live.test.ts
 *
 * Add `LIVE_REQUIRE_PERSISTENCE=1` to make the final persistence re-check a hard
 * assertion rather than a loudly printed measurement.
 *
 * StudioNet is gasless: the write costs 0 GEN.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEPLOYMENTS, connectWallet, readView, submitRecordWrite, type TxState } from "./genlayer";

const RUN_LIVE = process.env.RUN_LIVE === "1";
const RPC = "https://studio.genlayer.com/api";
/** How long the persistence re-check waits after finality for state to settle. */
const PERSISTENCE_DELAY_MS = 90_000;

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

interface Eip1193Request {
  method: string;
  params?: unknown[] | object;
}

describe.skipIf(!RUN_LIVE)("live StudioNet write through the real bridge", () => {
  afterEach(() => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, "ethereum");
  });

  it("connects, signs, finalizes by consensus, and reads the record back", async () => {
    const { createClient, createAccount } = await import("genlayer-js");
    const { studionet } = await import("genlayer-js/chains");

    const account = createAccount();
    // The signer: the same SDK the bridge uses, holding the local key.
    const broadcaster = createClient({ chain: studionet, account });

    // The wallet seam. Plain reads go to the network; the signature request is
    // answered by the local key instead of a MetaMask popup.
    const provider = {
      request: async ({ method, params }: Eip1193Request) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") {
          return [account.address];
        }
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
          return null;
        }
        // MetaMask-only discovery. `client.connect` asks which snaps the wallet has
        // while deciding whether to offer the GenLayer snap; an empty object is what a
        // wallet with none returns (a null here crashes inside the SDK — measured by
        // probe, 2026-10-23).
        if (method === "wallet_getSnaps" || method === "wallet_requestSnaps") {
          return {};
        }
        if (method === "eth_sendTransaction") {
          const [tx] = (params ?? []) as { to: string; data?: string; value?: string }[];
          if (!tx) throw new Error("eth_sendTransaction called without a transaction");
          return broadcaster.sendTransaction({
            account,
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}` | undefined,
            value: BigInt(tx.value ?? "0"),
          });
        }
        const response = await fetch(RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
        });
        const payload = (await response.json()) as { result?: unknown; error?: { message: string } };
        if (payload.error) throw new Error(payload.error.message);
        return payload.result;
      },
    };
    (window as unknown as Record<string, unknown>).ethereum = provider;

    // 1. The connect seam resolves to a connected wallet on StudioNet.
    const wallet = await connectWallet();
    expect(wallet.status).toBe("connected");
    expect(wallet.address).toBe(account.address);

    // 2. A real write, followed to finality by the real bridge.
    const verdictJudge = DEPLOYMENTS[0]!;
    const title = "Live screen wallet-path check";
    const seen: TxState[] = [];
    const final = await submitRecordWrite(
      verdictJudge,
      "create_judgment",
      [
        title,
        "ELIGIBLE,INELIGIBLE",
        JSON.stringify([
          {
            item_id: "hard_income",
            text: "Evidence must mention income.",
            kind: "DETERMINISTIC",
            rule_kind: "EVIDENCE_CONTAINS",
            rule_value: "income",
          },
          {
            item_id: "quality",
            text: "Assess whether the evidence is sufficient and relevant.",
            kind: "INTERPRETIVE",
          },
        ]),
      ],
      (state) => seen.push(state),
    );

    // The lifecycle really moved: signature, hash, consensus, finality.
    expect(seen.some((state) => state.phase === "signing")).toBe(true);
    expect(seen.some((state) => state.phase === "submitted" && !!state.hash)).toBe(true);
    expect(final.phase).toBe("finalized");
    expect(final.statusName).toBe("FINALIZED");

    // Consensus accepted it, and the leader's VM finished with a return value.
    // These are decoded from the measured snake_case receipt, so this assertion is
    // the regression guard for the bug this test exists to prevent.
    expect(final.votes).toContain("AGREE");
    expect(final.consensusResult).toBe("MAJORITY_AGREE");
    expect(final.execution).toBe("FINISHED_WITH_RETURN");
    expect(final.rounds).toBeDefined();

    // Evidence, printed the way the repo's integration tests print theirs.
    console.log(
      `live write: ${final.hash} → ${verdictJudge.recordView}(${String(final.recordId)}) ` +
        `${final.consensusResult} / ${final.execution}, votes ${JSON.stringify(final.votes)}`,
    );

    // 3. The record is on chain, created by this signer, and readable by anyone.
    expect(final.recordId).toBeTypeOf("number");
    const record = final.readBack as {
      title?: string;
      status?: string;
      creator?: string;
      verdict_set?: string[];
    };
    expect(record.title).toBe(title);
    expect(record.status).toBe("OPEN");
    expect(record.creator?.toLowerCase()).toBe(account.address.toLowerCase());
    expect(record.verdict_set).toEqual(["ELIGIBLE", "INELIGIBLE"]);

    // 4. Persistence re-check, after the state has had time to settle.
    //
    // Finality is not the same fact as persistence. StudioNet is a development network
    // whose committed contract state has been observed to roll back after finality: on
    // 2026-10-23 a record that this test had verified here, 90 s after finality, was
    // gone later the same session, and the contract's own `judgments_created` counter
    // had moved backwards (3 → 2). That is a property of the network, not of the write
    // path, so this phase measures it out loud instead of assuming it away.
    await new Promise((resolve) => setTimeout(resolve, PERSISTENCE_DELAY_MS));
    let persisted: unknown = null;
    try {
      const recheck = await readView(verdictJudge, verdictJudge.recordView, [final.recordId]);
      persisted = (recheck as { title?: string } | null)?.title === title ? recheck : null;
    } catch {
      persisted = null;
    }
    console.log(
      persisted
        ? `persistence re-check after ${PERSISTENCE_DELAY_MS / 1000}s: PERSISTED (record ${String(final.recordId)})`
        : `persistence re-check after ${PERSISTENCE_DELAY_MS / 1000}s: NOT PERSISTED — ` +
          "finalized by consensus, absent from committed state. StudioNet rolls state back " +
          "after finality; set LIVE_REQUIRE_PERSISTENCE=1 to make this fail anyway.",
    );
    if (process.env.LIVE_REQUIRE_PERSISTENCE === "1") {
      expect(persisted, "record did not persist after finality").not.toBeNull();
    }
  });
});
