import { getAddress, id, Interface } from "ethers";

import { BASELINE } from "./baseline.js";

const STAKE_TOPIC = id("Stake(address,uint256)");
const LIQUIDITY_MINING_INTERFACE = new Interface([
  "function totalUserStake(address user) view returns (uint256)",
]);

function blockTag(blockNumber) {
  return `0x${blockNumber.toString(16)}`;
}

function stakerFromLog(log) {
  if (
    !Array.isArray(log?.topics) ||
    log.topics.length < 2 ||
    log.topics[0]?.toLowerCase() !== STAKE_TOPIC.toLowerCase() ||
    !/^0x[a-fA-F0-9]{64}$/.test(log.topics[1])
  ) {
    return undefined;
  }
  return getAddress(`0x${log.topics[1].slice(-40)}`);
}

export async function findStakerWithPosition(
  provider,
  { fromBlock, toBlock, windowSize = 50_000 }
) {
  if (
    !Number.isSafeInteger(fromBlock) ||
    !Number.isSafeInteger(toBlock) ||
    fromBlock < 0 ||
    toBlock < fromBlock ||
    !Number.isSafeInteger(windowSize) ||
    windowSize <= 0
  ) {
    throw new Error("invalid staker discovery block range");
  }

  const checked = new Set();
  for (let end = toBlock; end >= fromBlock; ) {
    const start = Math.max(fromBlock, end - windowSize + 1);
    const logs = await provider.request({
      method: "eth_getLogs",
      params: [
        {
          address: BASELINE.proxy,
          fromBlock: blockTag(start),
          toBlock: blockTag(end),
          topics: [STAKE_TOPIC],
        },
      ],
    });

    for (const log of [...logs].reverse()) {
      const staker = stakerFromLog(log);
      if (!staker || checked.has(staker)) continue;
      checked.add(staker);

      const result = await provider.request({
        method: "eth_call",
        params: [
          {
            to: BASELINE.proxy,
            data: LIQUIDITY_MINING_INTERFACE.encodeFunctionData(
              "totalUserStake",
              [staker]
            ),
          },
          blockTag(toBlock),
        ],
      });
      const [stake] = LIQUIDITY_MINING_INTERFACE.decodeFunctionResult(
        "totalUserStake",
        result
      );
      if (stake > 0n) return staker;
    }

    end = start - 1;
  }

  throw new Error(
    `no active liquidity-mining staker found between blocks ${fromBlock} and ${toBlock}`
  );
}
