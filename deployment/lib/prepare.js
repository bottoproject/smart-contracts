import { readFileSync } from "node:fs";
import { join } from "node:path";

import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { ContractFactory, Wallet } from "ethers";

import {
  assertCompatibleValidationBytecode,
  assertMatchingV3Bytecode,
  loadReproducibleBuild,
  sha256File,
} from "./artifact.js";
import { BASELINE } from "./baseline.js";
import { inspectDeployment } from "./inspect.js";
import { verifyPreparedImplementationCode } from "./live.js";
import { buildUpgradeProposal } from "./proposals.js";
import {
  validatePreparationRecord,
  writePreparationRecord,
} from "./record.js";

const PREPARATION_MODE = "prepare-mainnet-v3";
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ZERO_PRIVATE_KEY = `0x${"0".repeat(64)}`;

export function assertPreparationAuthorized(env, chainId) {
  if (env.BOTTO_DEPLOYMENT_MODE !== PREPARATION_MODE) {
    throw new Error(
      `refusing deployment: set BOTTO_DEPLOYMENT_MODE=${PREPARATION_MODE}`
    );
  }
  if (BigInt(chainId) !== BigInt(BASELINE.chainId)) {
    throw new Error(
      `preparation chain ID mismatch: expected ${BASELINE.chainId}, observed ${chainId}`
    );
  }
  if (
    !PRIVATE_KEY_PATTERN.test(env.DEPLOYER_PRIVATE_KEY ?? "") ||
    env.DEPLOYER_PRIVATE_KEY.toLowerCase() === ZERO_PRIVATE_KEY
  ) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be one 32-byte hex key");
  }
  return env.DEPLOYER_PRIVATE_KEY;
}

export function buildPreparationRecord({
  inspection,
  blockNumber,
  newImplementation,
  bytecode,
  deploymentTransactionHash,
}) {
  return validatePreparationRecord({
    schemaVersion: 1,
    chainId: inspection.chainId,
    blockNumber,
    proxy: inspection.proxy,
    oldImplementation: inspection.implementation,
    newImplementation,
    proxyAdmin: inspection.proxyAdmin,
    contractOwner: inspection.contractOwner,
    proxyAdminOwner: inspection.proxyAdminOwner,
    bytecode,
    deploymentTransactionHash,
    upgradeProposal: buildUpgradeProposal(newImplementation),
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function prepareV3Implementation({
  hre,
  connection,
  repositoryRoot,
  privateKey,
}) {
  const inspection = await inspectDeployment(connection.provider);
  if (inspection.state !== "v2") {
    throw new Error(`preparation requires live V2 state, observed ${inspection.state}`);
  }

  const manifestPath = join(
    repositoryRoot,
    "deployments/builds/BottoLiquidityMiningV3.json"
  );
  const manifest = loadReproducibleBuild(repositoryRoot);
  const truffleV2 = readJson(
    join(repositoryRoot, "build/contracts/BottoLiquidityMiningV2.json")
  );
  const truffleV3 = readJson(
    join(repositoryRoot, "build/contracts/BottoLiquidityMiningV3.json")
  );
  const hardhatV2 = await hre.artifacts.readArtifact("BottoLiquidityMiningV2");
  const hardhatV3 = await hre.artifacts.readArtifact("BottoLiquidityMiningV3");

  assertMatchingV3Bytecode(manifest, truffleV3);
  assertCompatibleValidationBytecode(truffleV2, hardhatV2);
  assertCompatibleValidationBytecode(truffleV3, hardhatV3);

  const wallet = new Wallet(privateKey, connection.ethers.provider);
  const v2Factory = new ContractFactory(
    truffleV2.abi,
    truffleV2.bytecode,
    wallet
  );
  const v3Factory = new ContractFactory(
    truffleV3.abi,
    truffleV3.bytecode,
    wallet
  );
  const upgradesApi = await upgrades(hre, connection);

  await upgradesApi.forceImport(BASELINE.proxy, v2Factory, {
    kind: "transparent",
  });
  const deploymentTransaction = await upgradesApi.prepareUpgrade(
    BASELINE.proxy,
    v3Factory,
    {
      kind: "transparent",
      getTxResponse: true,
      redeployImplementation: "always",
    }
  );
  if (
    !deploymentTransaction ||
    typeof deploymentTransaction === "string" ||
    typeof deploymentTransaction.wait !== "function"
  ) {
    throw new Error("OpenZeppelin did not return the V3 deployment transaction");
  }

  const receipt = await deploymentTransaction.wait();
  if (!receipt?.contractAddress) {
    throw new Error("V3 deployment receipt did not contain a contract address");
  }
  const newImplementation = receipt.contractAddress;

  const record = buildPreparationRecord({
    inspection,
    blockNumber: receipt.blockNumber,
    newImplementation,
    bytecode: {
      creationSha256: manifest.bytecode.creationSha256,
      deployedSha256: manifest.bytecode.deployedSha256,
      artifactSha256: sha256File(manifestPath),
    },
    deploymentTransactionHash: deploymentTransaction.hash,
  });
  await verifyPreparedImplementationCode(connection.provider, record);

  const postInspection = await inspectDeployment(connection.provider, {
    preparedImplementation: newImplementation,
  });
  if (postInspection.state !== "prepared") {
    throw new Error(
      `proxy changed during preparation: expected prepared state, observed ${postInspection.state}`
    );
  }

  const path = writePreparationRecord(repositoryRoot, record);
  return { path, record };
}
