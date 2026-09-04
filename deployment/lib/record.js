import { getAddress, ZeroAddress } from "ethers";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { BASELINE } from "./baseline.js";
import { buildUpgradeProposal } from "./proposals.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const FORBIDDEN_FIELD_PATTERN =
  /(credential|private.*key|mnemonic|secret|rpc|url)/i;
const RECORD_KEYS = new Set([
  "schemaVersion",
  "chainId",
  "blockNumber",
  "proxy",
  "oldImplementation",
  "newImplementation",
  "proxyAdmin",
  "contractOwner",
  "proxyAdminOwner",
  "bytecode",
  "deploymentTransactionHash",
  "upgradeProposal",
]);
const BYTECODE_KEYS = new Set([
  "creationSha256",
  "deployedSha256",
  "artifactSha256",
]);
const RUNTIME_RECORD_RELATIVE_PATH = join(
  "deployments",
  "runtime",
  "mainnet-v3-preparation.json"
);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function findForbiddenField(value) {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_PATTERN.test(key)) return key;
    const found = findForbiddenField(nested);
    if (found) return `${key}.${found}`;
  }
  return undefined;
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of allowed) {
    if (!(key in value)) {
      throw new Error(`${label} is missing field ${key}`);
    }
  }
}

function assertBaselineAddress(observed, expected, label) {
  const address = getAddress(observed);
  if (address !== expected) {
    throw new Error(`record ${label} mismatch: expected ${expected}, observed ${address}`);
  }
  return address;
}

export function validatePreparationRecord(value) {
  assertPlainObject(value, "preparation record");
  const forbiddenField = findForbiddenField(value);
  if (forbiddenField) {
    throw new Error(`forbidden secret-like field ${forbiddenField}`);
  }
  assertExactKeys(value, RECORD_KEYS, "preparation record");

  if (value.schemaVersion !== 1) {
    throw new Error(`unsupported preparation record schema ${value.schemaVersion}`);
  }
  if (value.chainId !== BASELINE.chainId) {
    throw new Error(
      `record chain ID mismatch: expected ${BASELINE.chainId}, observed ${value.chainId}`
    );
  }
  if (!Number.isSafeInteger(value.blockNumber) || value.blockNumber <= 0) {
    throw new Error("record block number must be a positive safe integer");
  }

  const proxy = assertBaselineAddress(value.proxy, BASELINE.proxy, "proxy");
  const oldImplementation = assertBaselineAddress(
    value.oldImplementation,
    BASELINE.v2Implementation,
    "old implementation"
  );
  const proxyAdmin = assertBaselineAddress(
    value.proxyAdmin,
    BASELINE.proxyAdmin,
    "ProxyAdmin"
  );
  const contractOwner = assertBaselineAddress(
    value.contractOwner,
    BASELINE.owner,
    "contract owner"
  );
  const proxyAdminOwner = assertBaselineAddress(
    value.proxyAdminOwner,
    BASELINE.owner,
    "ProxyAdmin owner"
  );
  const newImplementation = getAddress(value.newImplementation);
  if (newImplementation === ZeroAddress) {
    throw new Error("record new implementation must not be the zero address");
  }

  assertPlainObject(value.bytecode, "record bytecode");
  assertExactKeys(value.bytecode, BYTECODE_KEYS, "record bytecode");
  for (const key of BYTECODE_KEYS) {
    if (!HASH_PATTERN.test(value.bytecode[key])) {
      throw new Error(`invalid ${key} in preparation record`);
    }
  }
  if (!TRANSACTION_HASH_PATTERN.test(value.deploymentTransactionHash)) {
    throw new Error("invalid deployment transaction hash in preparation record");
  }

  const expectedProposal = buildUpgradeProposal(newImplementation);
  if (JSON.stringify(value.upgradeProposal) !== JSON.stringify(expectedProposal)) {
    throw new Error("upgrade proposal does not match the preparation record");
  }

  return {
    schemaVersion: 1,
    chainId: BASELINE.chainId,
    blockNumber: value.blockNumber,
    proxy,
    oldImplementation,
    newImplementation,
    proxyAdmin,
    contractOwner,
    proxyAdminOwner,
    bytecode: { ...value.bytecode },
    deploymentTransactionHash: value.deploymentTransactionHash,
    upgradeProposal: expectedProposal,
  };
}

export function assertRecordMatchesReproducibleBuild(value, manifest) {
  const record = validatePreparationRecord(value);
  if (record.bytecode.creationSha256 !== manifest.bytecode?.creationSha256) {
    throw new Error(
      "record creation bytecode hash does not match the reproducible build"
    );
  }
  if (record.bytecode.deployedSha256 !== manifest.bytecode?.deployedSha256) {
    throw new Error(
      "record deployed bytecode hash does not match the reproducible build"
    );
  }
  return record;
}

export function preparationRecordPath(rootDir) {
  return join(rootDir, RUNTIME_RECORD_RELATIVE_PATH);
}

export function loadPreparationRecord(rootDir) {
  const path = preparationRecordPath(rootDir);
  return validatePreparationRecord(JSON.parse(readFileSync(path, "utf8")));
}

export function writePreparationRecord(rootDir, value) {
  const record = validatePreparationRecord(value);
  const path = preparationRecordPath(rootDir);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  mkdirSync(join(path, ".."), { recursive: true });
  rmSync(temporaryPath, { force: true });

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }

  return path;
}
