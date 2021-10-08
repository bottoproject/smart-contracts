require("dotenv").config({ path: "./.env.local" });
const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
  networks: {
    mainnet: {
      network_id: "1",
      provider: () =>
        new HDWalletProvider({
          privateKeys: [process.env.MAINNET_PK],
          providerOrUrl: process.env.MAINNET_PROVIDER,
        }),
      gasPrice: 120e9,
      networkCheckTimeout: 15000,
    },
    goerli: {
      network_id: "5",
      provider: () =>
        new HDWalletProvider({
          privateKeys: [process.env.GOERLI_PK],
          providerOrUrl: process.env.GOERLI_PROVIDER,
        }),
      gasPrice: 20e9,
      gas: 2000000,
      networkCheckTimeout: 15000,
    },
    kovan: {
      network_id: "42",
      provider: () =>
        new HDWalletProvider({
          privateKeys: [process.env.KOVAN_PK],
          providerOrUrl: process.env.KOVAN_PROVIDER,
        }),
      gasPrice: 10e9,
      gas: 3000000,
    },
  },
  plugins: ["truffle-plugin-verify"],
  api_keys: {
    etherscan: "XXX",
  },
  mocha: {},
  compilers: {
    solc: {
      version: "0.7.6",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
};
