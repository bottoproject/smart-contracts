import { getAddress, Interface } from "ethers";

import { sha256Bytecode } from "./artifact.js";
import { BASELINE } from "./baseline.js";

const V3_INTERFACE = new Interface([
  "function CLAIM_DEADLINE() view returns (uint256)",
  "function DAO_TREASURY() view returns (address)",
]);
const ERC20_INTERFACE = new Interface([
  "function balanceOf(address account) view returns (uint256)",
]);

async function request(provider, method, params = []) {
  return provider.request({ method, params });
}

async function call(provider, to, data) {
  return request(provider, "eth_call", [{ to, data }, "latest"]);
}

export async function verifyPreparedImplementationCode(provider, record) {
  const code = await request(provider, "eth_getCode", [
    record.newImplementation,
    "latest",
  ]);
  if (typeof code !== "string" || /^0x0*$/.test(code)) {
    throw new Error("prepared V3 implementation has no deployed code");
  }

  const observedHash = sha256Bytecode(code);
  if (observedHash !== record.bytecode.deployedSha256) {
    throw new Error(
      `prepared V3 deployed bytecode hash mismatch: expected ${record.bytecode.deployedSha256}, observed ${observedHash}`
    );
  }
  return observedHash;
}

export async function verifyUpgradedConstants(provider) {
  const deadlineResult = await call(
    provider,
    BASELINE.proxy,
    V3_INTERFACE.encodeFunctionData("CLAIM_DEADLINE")
  );
  const [deadline] = V3_INTERFACE.decodeFunctionResult(
    "CLAIM_DEADLINE",
    deadlineResult
  );
  if (deadline !== BigInt(BASELINE.claimDeadline)) {
    throw new Error(
      `claim deadline mismatch: expected ${BASELINE.claimDeadline}, observed ${deadline}`
    );
  }

  const treasuryResult = await call(
    provider,
    BASELINE.proxy,
    V3_INTERFACE.encodeFunctionData("DAO_TREASURY")
  );
  const [treasury] = V3_INTERFACE.decodeFunctionResult(
    "DAO_TREASURY",
    treasuryResult
  );
  const daoTreasury = getAddress(treasury);
  if (daoTreasury !== BASELINE.daoTreasury) {
    throw new Error(
      `DAO treasury mismatch: expected ${BASELINE.daoTreasury}, observed ${daoTreasury}`
    );
  }

  return {
    claimDeadline: Number(deadline),
    daoTreasury,
  };
}

export async function readRecoveryContext(provider) {
  const block = await request(provider, "eth_getBlockByNumber", [
    "latest",
    false,
  ]);
  const blockNumber = Number(BigInt(block.number));
  const timestamp = Number(BigInt(block.timestamp));
  if (timestamp <= BASELINE.claimDeadline) {
    throw new Error(
      `claim deadline has not passed: deadline ${BASELINE.claimDeadline}, latest timestamp ${timestamp}`
    );
  }

  const balanceResult = await call(
    provider,
    BASELINE.bottoToken,
    ERC20_INTERFACE.encodeFunctionData("balanceOf", [BASELINE.proxy])
  );
  const [bottoBalance] = ERC20_INTERFACE.decodeFunctionResult(
    "balanceOf",
    balanceResult
  );

  return { blockNumber, timestamp, bottoBalance };
}
