import { fileURLToPath } from "node:url";

import hre from "hardhat";

import {
  assertPreparationAuthorized,
  prepareV3Implementation,
} from "../lib/prepare.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const connection = await hre.network.create();

try {
  const chainIdHex = await connection.provider.request({ method: "eth_chainId" });
  const privateKey = assertPreparationAuthorized(
    process.env,
    BigInt(chainIdHex)
  );
  const result = await prepareV3Implementation({
    hre,
    connection,
    repositoryRoot,
    privateKey,
  });
  console.log(
    JSON.stringify(
      {
        preparationRecord: result.path,
        newImplementation: result.record.newImplementation,
        deploymentTransactionHash: result.record.deploymentTransactionHash,
        nextTransaction: result.record.upgradeProposal,
      },
      null,
      2
    )
  );
} finally {
  await connection.close();
}
