import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BASELINE } from "../../lib/baseline.js";
import {
  classifyImplementation,
  inspectDeployment,
} from "../../lib/inspect.js";

const OTHER_ADDRESS = "0x1111111111111111111111111111111111111111";

function addressWord(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function providerWith(overrides = {}) {
  const state = {
    chainId: "0x1",
    implementation: BASELINE.v2Implementation,
    proxyAdmin: BASELINE.proxyAdmin,
    contractOwner: BASELINE.owner,
    proxyAdminOwner: BASELINE.owner,
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
        if (params[1].toLowerCase() === BASELINE.implementationSlot.toLowerCase()) {
          return addressWord(state.implementation);
        }
        if (params[1].toLowerCase() === BASELINE.adminSlot.toLowerCase()) {
          return addressWord(state.proxyAdmin);
        }
      }

      if (method === "eth_call") {
        const target = params[0].to.toLowerCase();
        if (target === BASELINE.proxy.toLowerCase()) {
          return addressWord(state.contractOwner);
        }
        if (target === BASELINE.proxyAdmin.toLowerCase()) {
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
      proxy: BASELINE.proxy,
      implementation: BASELINE.v2Implementation,
      proxyAdmin: BASELINE.proxyAdmin,
      contractOwner: BASELINE.owner,
      proxyAdminOwner: BASELINE.owner,
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
      inspectDeployment(providerWith({ missingCodeAt: BASELINE.proxyAdmin })),
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
