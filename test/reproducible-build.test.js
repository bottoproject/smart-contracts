const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");

test("writes a deterministic bytecode manifest from a Truffle artifact", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "botto-build-manifest-"));
  const artifactPath = path.join(directory, "BottoLiquidityMiningV3.json");
  const manifestPath = path.join(directory, "manifest.json");

  try {
    writeFileSync(
      artifactPath,
      JSON.stringify({
        contractName: "BottoLiquidityMiningV3",
        bytecode: "0x6001",
        deployedBytecode: "0x6002",
        compiler: {
          name: "solc",
          version: "0.7.6+commit.7338295f.Emscripten.clang",
        },
        metadata: JSON.stringify({
          settings: {
            compilationTarget: {
              "project:/contracts/BottoLiquidityMiningV3.sol":
                "BottoLiquidityMiningV3",
            },
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "istanbul",
            libraries: {},
            metadata: { bytecodeHash: "ipfs" },
            remappings: [],
          },
        }),
      })
    );

    execFileSync(
      process.execPath,
      [
        path.join(projectRoot, "scripts/reproducible-build.js"),
        "--artifact",
        artifactPath,
        "--output",
        manifestPath,
      ],
      { cwd: projectRoot, stdio: "pipe" }
    );

    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), {
      schemaVersion: 1,
      contract: "BottoLiquidityMiningV3",
      toolchain: {
        node: "24.10.0",
        npm: "11.6.1",
        truffle: "5.11.5",
        solc: "0.7.6+commit.7338295f.Emscripten.clang",
        solcJsSha256:
          "b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2",
      },
      compilerSettings: {
        compilationTarget: {
          "project:/contracts/BottoLiquidityMiningV3.sol":
            "BottoLiquidityMiningV3",
        },
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "istanbul",
        libraries: {},
        metadata: { bytecodeHash: "ipfs" },
        remappings: [],
      },
      bytecode: {
        creationBytes: 2,
        creationSha256:
          "9e67b12fd8c58953460459cad7a6d4dd7d6d57594affce8206d1397c9c4db543",
        deployedBytes: 2,
        deployedSha256:
          "1a33f434c3fc58e156600f1814ef65f7c14ef8f9d2647208ff106b232120c871",
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
