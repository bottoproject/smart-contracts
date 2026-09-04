import { getAddress } from "ethers";

import { BASELINE } from "./baseline.js";

const OWNER_SELECTOR = "0x8da5cb5b";

function sameAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

function addressFromWord(word, label) {
  if (typeof word !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(word)) {
    throw new Error(`${label} returned an invalid address word`);
  }
  return getAddress(`0x${word.slice(-40)}`);
}

async function request(provider, method, params = []) {
  if (!provider || typeof provider.request !== "function") {
    throw new TypeError("provider must implement EIP-1193 request()");
  }
  return provider.request({ method, params });
}

async function assertCode(provider, address, label) {
  const code = await request(provider, "eth_getCode", [address, "latest"]);
  if (typeof code !== "string" || /^0x0*$/.test(code)) {
    throw new Error(`${label} has no deployed code at ${address}`);
  }
}

async function readOwner(provider, address, label) {
  const result = await request(provider, "eth_call", [
    { to: address, data: OWNER_SELECTOR },
    "latest",
  ]);
  return addressFromWord(result, `${label} owner()`);
}

export function classifyImplementation(observed, preparedImplementation) {
  if (sameAddress(observed, BASELINE.v2Implementation)) {
    return preparedImplementation ? "prepared" : "v2";
  }
  if (
    preparedImplementation &&
    sameAddress(observed, preparedImplementation)
  ) {
    return "upgraded";
  }
  throw new Error(`unknown proxy implementation: observed ${observed}`);
}

export async function inspectDeployment(provider, options = {}) {
  const chainIdHex = await request(provider, "eth_chainId");
  const chainId = Number(BigInt(chainIdHex));
  if (chainId !== BASELINE.chainId) {
    throw new Error(
      `chain ID mismatch: expected ${BASELINE.chainId}, observed ${chainId}`
    );
  }

  await assertCode(provider, BASELINE.proxy, "liquidity-mining proxy");
  await assertCode(provider, BASELINE.v2Implementation, "V2 implementation");
  await assertCode(provider, BASELINE.proxyAdmin, "ProxyAdmin");

  const implementation = addressFromWord(
    await request(provider, "eth_getStorageAt", [
      BASELINE.proxy,
      BASELINE.implementationSlot,
      "latest",
    ]),
    "implementation slot"
  );
  const proxyAdmin = addressFromWord(
    await request(provider, "eth_getStorageAt", [
      BASELINE.proxy,
      BASELINE.adminSlot,
      "latest",
    ]),
    "admin slot"
  );

  if (!sameAddress(proxyAdmin, BASELINE.proxyAdmin)) {
    throw new Error(
      `ProxyAdmin mismatch: expected ${BASELINE.proxyAdmin}, observed ${proxyAdmin}`
    );
  }

  const state = classifyImplementation(
    implementation,
    options.preparedImplementation
  );
  if (state === "upgraded") {
    await assertCode(provider, implementation, "prepared V3 implementation");
  }

  const contractOwner = await readOwner(
    provider,
    BASELINE.proxy,
    "liquidity-mining proxy"
  );
  if (!sameAddress(contractOwner, BASELINE.owner)) {
    throw new Error(
      `contract owner mismatch: expected ${BASELINE.owner}, observed ${contractOwner}`
    );
  }

  const proxyAdminOwner = await readOwner(
    provider,
    BASELINE.proxyAdmin,
    "ProxyAdmin"
  );
  if (!sameAddress(proxyAdminOwner, BASELINE.owner)) {
    throw new Error(
      `ProxyAdmin owner mismatch: expected ${BASELINE.owner}, observed ${proxyAdminOwner}`
    );
  }

  return {
    chainId,
    state,
    proxy: BASELINE.proxy,
    implementation,
    proxyAdmin,
    contractOwner,
    proxyAdminOwner,
  };
}
