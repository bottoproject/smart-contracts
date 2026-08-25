import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildRecoveryProposal,
  buildUpgradeProposal,
} from "../../lib/proposals.js";

const NEW_IMPLEMENTATION = "0x1111111111111111111111111111111111111111";
const UPGRADE_CALLDATA =
  "0x99a88ec4" +
  "000000000000000000000000f8515cae6915838543bcd7756f39268ce8f853fd" +
  "0000000000000000000000001111111111111111111111111111111111111111";

describe("unsigned BIP-86 proposals", () => {
  test("builds the exact ProxyAdmin upgrade transaction", () => {
    assert.deepEqual(buildUpgradeProposal(NEW_IMPLEMENTATION), {
      chainId: 1,
      action: "upgrade BottoLiquidityMining proxy to V3",
      to: "0x61b4A813Fd4e361d40339bcA4d8d4E83Be78038D",
      value: "0",
      data: UPGRADE_CALLDATA,
      expectedSender: "0xcC23e5a344EB4E99114a8F25f6037951A39AA858",
      proxy: "0xf8515Cae6915838543bCD7756F39268CE8F853Fd",
      newImplementation: NEW_IMPLEMENTATION,
    });
  });

  test("rejects an upgrade to the zero address", () => {
    assert.throws(
      () => buildUpgradeProposal("0x0000000000000000000000000000000000000000"),
      /new implementation must not be the zero address/
    );
  });

  test("builds the exact reward-recovery transaction", () => {
    assert.deepEqual(buildRecoveryProposal({ bottoBalance: 123n }), {
      chainId: 1,
      action: "recover expired BOTTO rewards to the DAO treasury",
      to: "0xf8515Cae6915838543bCD7756F39268CE8F853Fd",
      value: "0",
      data: "0xf290a618",
      expectedSender: "0xcC23e5a344EB4E99114a8F25f6037951A39AA858",
      expectedRecipient: "0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49",
      observedBottoBalance: "123",
    });
  });
});
