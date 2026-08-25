import { spawnSync } from "node:child_process";

if (!process.env.MAINNET_RPC_URL) {
  console.log(
    "SKIP BIP-86 mainnet-fork test: MAINNET_RPC_URL is not configured."
  );
  process.exit(0);
}

const result = spawnSync(
  "hardhat",
  [
    "run",
    "test/fork/bip86-upgrade.test.js",
    "--network",
    "hardhatMainnet",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      MANIFEST_DEFAULT_DIR:
        process.env.MANIFEST_DEFAULT_DIR ?? ".openzeppelin/tests",
    },
  }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
