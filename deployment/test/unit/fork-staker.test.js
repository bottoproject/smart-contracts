import assert from "node:assert/strict";
import { test } from "node:test";

import { findStakerWithPosition } from "../../lib/fork-staker.js";

const STAKER = "0xfac23E6F8b95f05e3c068F258f7386a02F5D7536";
const EMPTY_STAKER = "0x1111111111111111111111111111111111111111";
const STAKE_TOPIC =
  "0xebedb8b3c678666e7f36970bc8f57abf6d8fa2e828c0da91ea5b75bf68ed101a";

function addressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function providerWithLogs() {
  return {
    async request({ method, params }) {
      if (method === "eth_getLogs") {
        return [
          {
            address: "0xf8515cae6915838543bcd7756f39268ce8f853fd",
            blockNumber: "0x1482b90",
            data: "0x" + "0".repeat(64),
            topics: [STAKE_TOPIC, addressTopic(STAKER)],
          },
          {
            address: "0xf8515cae6915838543bcd7756f39268ce8f853fd",
            blockNumber: "0x1482b91",
            data: "0x" + "0".repeat(64),
            topics: [STAKE_TOPIC, addressTopic(EMPTY_STAKER)],
          },
          { address: "0x0", blockNumber: "0x1482b92", data: "0x", topics: [] },
        ];
      }
      if (method === "eth_call") {
        const encodedAddress = `0x${params[0].data.slice(-40)}`.toLowerCase();
        const amount = encodedAddress === STAKER.toLowerCase() ? 42n : 0n;
        return `0x${amount.toString(16).padStart(64, "0")}`;
      }
      throw new Error(`unexpected test RPC method ${method}`);
    },
  };
}

test("finds the newest event participant who still has an LP position", async () => {
  assert.equal(
    await findStakerWithPosition(providerWithLogs(), {
      fromBlock: 21_507_080,
      toBlock: 21_507_100,
    }),
    STAKER
  );
});

test("fails clearly when no event participant has an LP position", async () => {
  const provider = providerWithLogs();
  provider.request = async ({ method }) => {
    if (method === "eth_getLogs") return [];
    throw new Error(`unexpected test RPC method ${method}`);
  };
  await assert.rejects(
    findStakerWithPosition(provider, {
      fromBlock: 21_507_080,
      toBlock: 21_507_100,
    }),
    /no active liquidity-mining staker found/
  );
});
