import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const MANIFEST_PATH = "deployments/builds/BottoLiquidityMiningV3.json";
const CONTRACT_NAME = "BottoLiquidityMiningV3";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function normalizeRoot(rootDir) {
  if (rootDir instanceof URL) {
    return rootDir;
  }

  const withTrailingSlash = rootDir.endsWith("/") ? rootDir : `${rootDir}/`;
  return pathToFileURL(withTrailingSlash);
}

function assertHexBytecode(bytecode, label) {
  if (typeof bytecode !== "string") {
    throw new TypeError(`${label} must be a hex string`);
  }

  const normalized = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[a-fA-F0-9]+$/.test(normalized)) {
    throw new Error(`${label} must contain complete hexadecimal bytes`);
  }

  return normalized;
}

export function sha256Bytecode(bytecode) {
  const normalized = assertHexBytecode(bytecode, "bytecode");
  return createHash("sha256")
    .update(Buffer.from(normalized, "hex"))
    .digest("hex");
}

export function stripSolidityMetadata(bytecode) {
  const normalized = assertHexBytecode(bytecode, "Solidity bytecode");
  if (normalized.length < 4) {
    throw new Error("Solidity bytecode is missing its metadata length suffix");
  }

  const metadataBytes = Number.parseInt(normalized.slice(-4), 16);
  const metadataHexLength = (metadataBytes + 2) * 2;
  if (metadataHexLength >= normalized.length) {
    throw new Error("Solidity bytecode contains an invalid metadata length");
  }

  return `0x${normalized.slice(0, -metadataHexLength).toLowerCase()}`;
}

export function assertCompatibleValidationBytecode(
  reproducibleArtifact,
  validationArtifact
) {
  const pairs = [
    ["creation", reproducibleArtifact.bytecode, validationArtifact.bytecode],
    [
      "deployed",
      reproducibleArtifact.deployedBytecode,
      validationArtifact.deployedBytecode,
    ],
  ];
  const result = {};

  for (const [label, reproducible, validation] of pairs) {
    const expected = stripSolidityMetadata(reproducible);
    const observed = stripSolidityMetadata(validation);
    if (observed !== expected) {
      throw new Error(`${label} executable bytecode mismatch`);
    }
    result[`${label}ExecutableBytes`] = (expected.length - 2) / 2;
  }

  return result;
}

export function loadReproducibleBuild(rootDir) {
  const manifestUrl = new URL(MANIFEST_PATH, normalizeRoot(rootDir));
  const manifest = JSON.parse(readFileSync(fileURLToPath(manifestUrl), "utf8"));

  if (manifest.schemaVersion !== 1 || manifest.contract !== CONTRACT_NAME) {
    throw new Error(`invalid reproducible ${CONTRACT_NAME} manifest`);
  }

  if (
    !SHA256_PATTERN.test(manifest.bytecode?.creationSha256 ?? "") ||
    !SHA256_PATTERN.test(manifest.bytecode?.deployedSha256 ?? "")
  ) {
    throw new Error("reproducible manifest contains invalid bytecode hashes");
  }

  return manifest;
}

export function assertMatchingV3Bytecode(manifest, hardhatArtifact) {
  if (hardhatArtifact?.contractName !== CONTRACT_NAME) {
    throw new Error(`expected Hardhat artifact for ${CONTRACT_NAME}`);
  }

  const creationSha256 = sha256Bytecode(hardhatArtifact.bytecode);
  const deployedSha256 = sha256Bytecode(hardhatArtifact.deployedBytecode);

  if (creationSha256 !== manifest.bytecode?.creationSha256) {
    throw new Error(
      `creation bytecode hash mismatch: expected ${manifest.bytecode?.creationSha256}, observed ${creationSha256}`
    );
  }

  if (deployedSha256 !== manifest.bytecode?.deployedSha256) {
    throw new Error(
      `deployed bytecode hash mismatch: expected ${manifest.bytecode?.deployedSha256}, observed ${deployedSha256}`
    );
  }

  return { creationSha256, deployedSha256 };
}
