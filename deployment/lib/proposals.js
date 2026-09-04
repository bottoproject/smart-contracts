import { getAddress, Interface, ZeroAddress } from "ethers";

import { BASELINE } from "./baseline.js";

const PROXY_ADMIN_INTERFACE = new Interface([
  "function upgrade(address proxy,address implementation)",
]);
const RECOVERY_INTERFACE = new Interface([
  "function recoverUnclaimedRewards()",
]);

export function buildUpgradeProposal(newImplementation) {
  const implementation = getAddress(newImplementation);
  if (implementation === ZeroAddress) {
    throw new Error("new implementation must not be the zero address");
  }

  return {
    chainId: BASELINE.chainId,
    action: "upgrade BottoLiquidityMining proxy to V3",
    to: BASELINE.proxyAdmin,
    value: "0",
    data: PROXY_ADMIN_INTERFACE.encodeFunctionData("upgrade", [
      BASELINE.proxy,
      implementation,
    ]),
    expectedSender: BASELINE.owner,
    proxy: BASELINE.proxy,
    newImplementation: implementation,
  };
}

export function buildRecoveryProposal({ bottoBalance }) {
  const balance = BigInt(bottoBalance);
  if (balance < 0n) {
    throw new Error("observed BOTTO balance must not be negative");
  }

  return {
    chainId: BASELINE.chainId,
    action: "recover expired BOTTO rewards to the DAO treasury",
    to: BASELINE.proxy,
    value: "0",
    data: RECOVERY_INTERFACE.encodeFunctionData("recoverUnclaimedRewards"),
    expectedSender: BASELINE.owner,
    expectedRecipient: BASELINE.daoTreasury,
    observedBottoBalance: balance.toString(),
  };
}
