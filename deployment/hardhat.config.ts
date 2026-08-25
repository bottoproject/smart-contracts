import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatUpgrades from "@openzeppelin/hardhat-upgrades";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers, hardhatUpgrades],
  paths: {
    sources: "project:",
    tests: "test/fork",
    cache: "cache",
    artifacts: "artifacts",
  },
  solidity: {
    version: "0.7.6",
    settings: {
      evmVersion: "istanbul",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      metadata: {
        bytecodeHash: "ipfs",
      },
    },
  },
  networks: {
    mainnet: {
      type: "http",
      chainType: "l1",
      chainId: 1,
      url: configVariable("MAINNET_RPC_URL"),
    },
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 1,
      forking: {
        url: configVariable("MAINNET_RPC_URL"),
        blockNumber: 25_832_838,
      },
    },
  },
});
