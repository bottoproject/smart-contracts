import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BASELINE } from "../../lib/baseline.js";
import {
  classifyImplementation,
  inspectDeployment,
} from "../../lib/inspect.js";

const OTHER_ADDRESS = "0x1111111111111111111111111111111111111111";
const PROXY = "0xf8515Cae6915838543bCD7756F39268CE8F853Fd";
const V2 = "0x49129912b35283DC64476641837DFE856B48Fa81";
const PROXY_ADMIN = "0x61b4A813Fd4e361d40339bcA4d8d4E83Be78038D";
const OWNER = "0xcC23e5a344EB4E99114a8F25f6037951A39AA858";
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

function addressWord(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function providerWith(overrides = {}) {
  const state = {
    chainId: "0x1",
    implementation: V2,
    proxyAdmin: PROXY_ADMIN,
    contractOwner: OWNER,
    proxyAdminOwner: OWNER,
    missingCodeAt: undefined,
    ...overrides,
  };

  return {
    async request({ method, params = [] }) {
      if (method === "eth_chainId") return state.chainId;

      if (method === "eth_getCode") {
        return params[0].toLowerCase() === state.missingCodeAt?.toLowerCase()
          ? "0x"
          : "0x6000";
      }

      if (method === "eth_getStorageAt") {
        if (params[1].toLowerCase() === IMPLEMENTATION_SLOT) {
          return addressWord(state.implementation);
        }
        if (params[1].toLowerCase() === ADMIN_SLOT) {
          return addressWord(state.proxyAdmin);
        }
      }

      if (method === "eth_call") {
        const target = params[0].to.toLowerCase();
        if (target === PROXY.toLowerCase()) {
          return addressWord(state.contractOwner);
        }
        if (target === PROXY_ADMIN.toLowerCase()) {
          return addressWord(state.proxyAdminOwner);
        }
      }

      throw new Error(`unexpected test RPC method ${method}`);
    },
  };
}

describe("BIP-86 deployment inspection", () => {
  test("accepts the approved live V2 baseline", async () => {
    const inspection = await inspectDeployment(providerWith());

    assert.deepEqual(inspection, {
      chainId: 1,
      state: "v2",
      proxy: PROXY,
      implementation: V2,
      proxyAdmin: PROXY_ADMIN,
      contractOwner: OWNER,
      proxyAdminOwner: OWNER,
    });
  });

  test("rejects a provider connected to a different chain", async () => {
    await assert.rejects(
      inspectDeployment(providerWith({ chainId: "0xaa36a7" })),
      /chain ID mismatch: expected 1, observed 11155111/
    );
  });

  test("rejects a proxy controlled by an unexpected ProxyAdmin", async () => {
    await assert.rejects(
      inspectDeployment(providerWith({ proxyAdmin: OTHER_ADDRESS })),
      /ProxyAdmin mismatch/
    );
  });

  test("rejects an unexpected implementation", async () => {
    await assert.rejects(
      inspectDeployment(providerWith({ implementation: OTHER_ADDRESS })),
      /unknown proxy implementation/
    );
  });

  test("rejects an unexpected contract owner", async () => {
    await assert.rejects(
      inspectDeployment(providerWith({ contractOwner: OTHER_ADDRESS })),
      /contract owner mismatch/
    );
  });

  test("rejects a baseline address without deployed code", async () => {
    await assert.rejects(
      inspectDeployment(providerWith({ missingCodeAt: PROXY_ADMIN })),
      /ProxyAdmin has no deployed code/
    );
  });

  test("classifies a prepared and upgraded implementation explicitly", () => {
    assert.equal(
      classifyImplementation(BASELINE.v2Implementation, OTHER_ADDRESS),
      "prepared"
    );
    assert.equal(classifyImplementation(OTHER_ADDRESS, OTHER_ADDRESS), "upgraded");
  });
});
