import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BASELINE } from "../../lib/baseline.js";
import {
  readRecoveryContext,
  verifyPreparedImplementationCode,
  verifyUpgradedConstants,
} from "../../lib/live.js";
import { sha256Bytecode } from "../../lib/artifact.js";

const NEW_IMPLEMENTATION = "0x1111111111111111111111111111111111111111";
const DEPLOYED_CODE = "0x6000";

function word(value) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function addressWord(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function liveProvider(overrides = {}) {
  const state = {
    code: DEPLOYED_CODE,
    deadline: BASELINE.claimDeadline,
    treasury: BASELINE.daoTreasury,
    timestamp: BASELINE.claimDeadline + 1,
    bottoBalance: 123n,
    ...overrides,
  };

  return {
    async request({ method, params = [] }) {
      if (method === "eth_getCode") return state.code;
      if (method === "eth_getBlockByNumber") {
        return { number: "0x18a3826", timestamp: `0x${state.timestamp.toString(16)}` };
      }
      if (method === "eth_call") {
        const selector = params[0].data.slice(0, 10);
        if (selector === "0x42f81580") return word(state.deadline);
        if (selector === "0x9dc78ee6") return addressWord(state.treasury);
        if (selector === "0x70a08231") return word(state.bottoBalance);
      }
      throw new Error(`unexpected test RPC method ${method}`);
    },
  };
}

function record() {
  return {
    newImplementation: NEW_IMPLEMENTATION,
    bytecode: { deployedSha256: sha256Bytecode(DEPLOYED_CODE) },
  };
}

describe("live V3 verification", () => {
  test("accepts implementation code matching the preparation record", async () => {
    assert.equal(
      await verifyPreparedImplementationCode(liveProvider(), record()),
      sha256Bytecode(DEPLOYED_CODE)
    );
  });

  test("rejects implementation code changed after preparation", async () => {
    await assert.rejects(
      verifyPreparedImplementationCode(liveProvider({ code: "0x6001" }), record()),
      /prepared V3 deployed bytecode hash mismatch/
    );
  });

  test("verifies the governance constants through the upgraded proxy", async () => {
    assert.deepEqual(await verifyUpgradedConstants(liveProvider()), {
      claimDeadline: BASELINE.claimDeadline,
      daoTreasury: BASELINE.daoTreasury,
    });
  });

  test("rejects an upgraded proxy exposing a different deadline", async () => {
    await assert.rejects(
      verifyUpgradedConstants(
        liveProvider({ deadline: BASELINE.claimDeadline + 1 })
      ),
      /claim deadline mismatch/
    );
  });

  test("reads a post-deadline BOTTO recovery context", async () => {
    assert.deepEqual(await readRecoveryContext(liveProvider()), {
      blockNumber: 25_835_558,
      timestamp: BASELINE.claimDeadline + 1,
      bottoBalance: 123n,
    });
  });

  test("rejects recovery at or before the claim deadline", async () => {
    await assert.rejects(
      readRecoveryContext(liveProvider({ timestamp: BASELINE.claimDeadline })),
      /claim deadline has not passed/
    );
  });
});
