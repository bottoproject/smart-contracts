import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  assertCompatibleValidationBytecode,
  assertMatchingV3Bytecode,
  loadReproducibleBuild,
  sha256Bytecode,
  sha256File,
  stripSolidityMetadata,
} from "../../lib/artifact.js";

const ZERO_BYTE_SHA256 =
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";
const ONE_BYTE_SHA256 =
  "4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a";

describe("deployment artifact safety", () => {
  test("hashes bytecode bytes rather than their hex text", () => {
    assert.equal(sha256Bytecode("0x00"), ZERO_BYTE_SHA256);
    assert.equal(sha256Bytecode("01"), ONE_BYTE_SHA256);
  });

  test("hashes reproducible manifest files as raw bytes", () => {
    const directory = mkdtempSync(join(tmpdir(), "botto-artifact-hash-"));
    try {
      const path = join(directory, "manifest.json");
      writeFileSync(path, Buffer.from([0x00]));
      assert.equal(sha256File(path), ZERO_BYTE_SHA256);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("strips only the Solidity CBOR metadata suffix", () => {
    assert.equal(stripSolidityMetadata("0x6000a10001"), "0x6000");
  });

  test("accepts validation bytecode whose executable matches the reproducible artifact", () => {
    assert.deepEqual(
      assertCompatibleValidationBytecode(
        {
          bytecode: "0x6000a10001",
          deployedBytecode: "0x6001a10001",
        },
        {
          bytecode: "0x6000a20001",
          deployedBytecode: "0x6001a20001",
        }
      ),
      { creationExecutableBytes: 2, deployedExecutableBytes: 2 }
    );
  });

  test("rejects validation bytecode whose executable differs", () => {
    assert.throws(
      () =>
        assertCompatibleValidationBytecode(
          {
            bytecode: "0x6000a10001",
            deployedBytecode: "0x6001a10001",
          },
          {
            bytecode: "0x6002a20001",
            deployedBytecode: "0x6001a20001",
          }
        ),
      /creation executable bytecode mismatch/
    );
  });

  test("accepts Hardhat bytecode matching the reproducible manifest", () => {
    const manifest = {
      schemaVersion: 1,
      contract: "BottoLiquidityMiningV3",
      bytecode: {
        creationSha256: ZERO_BYTE_SHA256,
        deployedSha256: ONE_BYTE_SHA256,
      },
    };

    assert.deepEqual(
      assertMatchingV3Bytecode(manifest, {
        contractName: "BottoLiquidityMiningV3",
        bytecode: "0x00",
        deployedBytecode: "0x01",
      }),
      {
        creationSha256: ZERO_BYTE_SHA256,
        deployedSha256: ONE_BYTE_SHA256,
      }
    );
  });

  test("rejects creation bytecode that differs from the reproducible build", () => {
    const manifest = {
      schemaVersion: 1,
      contract: "BottoLiquidityMiningV3",
      bytecode: {
        creationSha256: ONE_BYTE_SHA256,
        deployedSha256: ONE_BYTE_SHA256,
      },
    };

    assert.throws(
      () =>
        assertMatchingV3Bytecode(manifest, {
          contractName: "BottoLiquidityMiningV3",
          bytecode: "0x00",
          deployedBytecode: "0x01",
        }),
      /creation bytecode hash mismatch/
    );
  });

  test("rejects deployed bytecode that differs from the reproducible build", () => {
    const manifest = {
      schemaVersion: 1,
      contract: "BottoLiquidityMiningV3",
      bytecode: {
        creationSha256: ZERO_BYTE_SHA256,
        deployedSha256: ZERO_BYTE_SHA256,
      },
    };

    assert.throws(
      () =>
        assertMatchingV3Bytecode(manifest, {
          contractName: "BottoLiquidityMiningV3",
          bytecode: "0x00",
          deployedBytecode: "0x01",
        }),
      /deployed bytecode hash mismatch/
    );
  });

  test("loads and validates the committed reproducible manifest", () => {
    const manifest = loadReproducibleBuild(new URL("../../../", import.meta.url));

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.contract, "BottoLiquidityMiningV3");
    assert.match(manifest.bytecode.creationSha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.bytecode.deployedSha256, /^[a-f0-9]{64}$/);
  });
});
