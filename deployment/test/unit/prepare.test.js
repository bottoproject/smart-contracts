import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assertPreparationAuthorized,
  buildPreparationRecord,
} from "../../lib/prepare.js";

const VALID_PRIVATE_KEY = `0x${"1".repeat(64)}`;
const NEW_IMPLEMENTATION = "0x1111111111111111111111111111111111111111";
const HASH = "a".repeat(64);

describe("mainnet implementation preparation authorization", () => {
  test("refuses preparation without the exact acknowledgement", () => {
    assert.throws(
      () =>
        assertPreparationAuthorized(
          { DEPLOYER_PRIVATE_KEY: VALID_PRIVATE_KEY },
          1n
        ),
      /BOTTO_DEPLOYMENT_MODE=prepare-mainnet-v3/
    );
  });

  test("refuses a similar but incorrect acknowledgement", () => {
    assert.throws(
      () =>
        assertPreparationAuthorized(
          {
            BOTTO_DEPLOYMENT_MODE: "prepare-mainnet",
            DEPLOYER_PRIVATE_KEY: VALID_PRIVATE_KEY,
          },
          1n
        ),
      /BOTTO_DEPLOYMENT_MODE=prepare-mainnet-v3/
    );
  });

  test("refuses preparation on a chain other than Ethereum mainnet", () => {
    assert.throws(
      () =>
        assertPreparationAuthorized(
          {
            BOTTO_DEPLOYMENT_MODE: "prepare-mainnet-v3",
            DEPLOYER_PRIVATE_KEY: VALID_PRIVATE_KEY,
          },
          11155111n
        ),
      /preparation chain ID mismatch/
    );
  });

  test("refuses preparation without a valid deployer key", () => {
    assert.throws(
      () =>
        assertPreparationAuthorized(
          { BOTTO_DEPLOYMENT_MODE: "prepare-mainnet-v3" },
          1n
        ),
      /DEPLOYER_PRIVATE_KEY must be one 32-byte hex key/
    );
  });

  test("accepts only the exact acknowledgement, chain, and key", () => {
    assert.equal(
      assertPreparationAuthorized(
        {
          BOTTO_DEPLOYMENT_MODE: "prepare-mainnet-v3",
          DEPLOYER_PRIVATE_KEY: VALID_PRIVATE_KEY,
        },
        1n
      ),
      VALID_PRIVATE_KEY
    );
  });

  test("builds a strict preparation record from verified deployment results", () => {
    const record = buildPreparationRecord({
      inspection: {
        chainId: 1,
        proxy: "0xf8515Cae6915838543bCD7756F39268CE8F853Fd",
        implementation: "0x49129912b35283DC64476641837DFE856B48Fa81",
        proxyAdmin: "0x61b4A813Fd4e361d40339bcA4d8d4E83Be78038D",
        contractOwner: "0xcC23e5a344EB4E99114a8F25f6037951A39AA858",
        proxyAdminOwner: "0xcC23e5a344EB4E99114a8F25f6037951A39AA858",
      },
      blockNumber: 25_832_838,
      newImplementation: NEW_IMPLEMENTATION,
      bytecode: {
        creationSha256: HASH,
        deployedSha256: HASH,
        artifactSha256: HASH,
      },
      deploymentTransactionHash: `0x${"b".repeat(64)}`,
    });

    assert.equal(record.schemaVersion, 1);
    assert.equal(record.newImplementation, NEW_IMPLEMENTATION);
    assert.equal(record.upgradeProposal.data.slice(0, 10), "0x99a88ec4");
    assert.equal(record.upgradeProposal.to, "0x61b4A813Fd4e361d40339bcA4d8d4E83Be78038D");
  });
});
