import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { buildUpgradeProposal } from "../../lib/proposals.js";
import {
  loadPreparationRecord,
  assertRecordMatchesReproducibleBuild,
  validatePreparationRecord,
  writePreparationRecord,
} from "../../lib/record.js";

const NEW_IMPLEMENTATION = "0x1111111111111111111111111111111111111111";
const HASH = "a".repeat(64);
const TX_HASH = `0x${"b".repeat(64)}`;

function validRecord() {
  return {
    schemaVersion: 1,
    chainId: 1,
    blockNumber: 25_832_838,
    proxy: "0xf8515Cae6915838543bCD7756F39268CE8F853Fd",
    oldImplementation: "0x49129912b35283DC64476641837DFE856B48Fa81",
    newImplementation: NEW_IMPLEMENTATION,
    proxyAdmin: "0x61b4A813Fd4e361d40339bcA4d8d4E83Be78038D",
    contractOwner: "0xcC23e5a344EB4E99114a8F25f6037951A39AA858",
    proxyAdminOwner: "0xcC23e5a344EB4E99114a8F25f6037951A39AA858",
    bytecode: {
      creationSha256: HASH,
      deployedSha256: HASH,
      artifactSha256: HASH,
    },
    deploymentTransactionHash: TX_HASH,
    upgradeProposal: buildUpgradeProposal(NEW_IMPLEMENTATION),
  };
}

describe("mainnet V3 preparation record", () => {
  test("accepts a complete record for the fixed deployment", () => {
    assert.deepEqual(validatePreparationRecord(validRecord()), validRecord());
  });

  test("rejects a record for another chain", () => {
    const record = validRecord();
    record.chainId = 11155111;
    assert.throws(() => validatePreparationRecord(record), /record chain ID mismatch/);
  });

  test("rejects a record with a changed baseline address", () => {
    const record = validRecord();
    record.proxyAdmin = NEW_IMPLEMENTATION;
    assert.throws(() => validatePreparationRecord(record), /record ProxyAdmin mismatch/);
  });

  test("rejects a malformed bytecode hash", () => {
    const record = validRecord();
    record.bytecode.deployedSha256 = "not-a-hash";
    assert.throws(() => validatePreparationRecord(record), /invalid deployedSha256/);
  });

  test("rejects secret material anywhere in the record", () => {
    const record = validRecord();
    record.credentials = { privateKey: `0x${"1".repeat(64)}` };
    assert.throws(
      () => validatePreparationRecord(record),
      /forbidden secret-like field credentials/
    );
  });

  test("rejects calldata that does not target the recorded implementation", () => {
    const record = validRecord();
    record.upgradeProposal = buildUpgradeProposal(
      "0x2222222222222222222222222222222222222222"
    );
    assert.throws(
      () => validatePreparationRecord(record),
      /upgrade proposal does not match the preparation record/
    );
  });

  test("writes and reloads a private runtime record atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "botto-runtime-record-"));
    try {
      const path = writePreparationRecord(root, validRecord());
      assert.equal(statSync(path).mode & 0o777, 0o600);
      assert.deepEqual(loadPreparationRecord(root), validRecord());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a record whose hashes no longer match the reproducible build", () => {
    const record = validRecord();
    assert.throws(
      () =>
        assertRecordMatchesReproducibleBuild(record, {
          bytecode: {
            creationSha256: "c".repeat(64),
            deployedSha256: HASH,
          },
        }),
      /record creation bytecode hash does not match the reproducible build/
    );
  });
});
