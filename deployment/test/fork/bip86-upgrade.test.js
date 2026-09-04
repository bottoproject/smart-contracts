import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Contract } from "ethers";
import hre from "hardhat";

import { BASELINE } from "../../lib/baseline.js";
import { findStakerWithPosition } from "../../lib/fork-staker.js";
import { inspectDeployment } from "../../lib/inspect.js";
import {
  verifyPreparedImplementationCode,
  verifyUpgradedConstants,
} from "../../lib/live.js";
import { prepareV3Implementation } from "../../lib/prepare.js";
import { buildRecoveryProposal } from "../../lib/proposals.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const runtimeRoot = mkdtempSync(join(tmpdir(), "botto-mainnet-fork-"));
const connection = await hre.network.create();

async function impersonate(address) {
  await connection.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  await connection.provider.request({
    method: "hardhat_setBalance",
    params: [address, "0x56bc75e2d63100000"],
  });
  return connection.ethers.getSigner(address);
}

try {
  const before = await inspectDeployment(connection.provider);
  assert.equal(before.state, "v2");

  const staker = await findStakerWithPosition(connection.provider, {
    fromBlock: 21_507_080,
    toBlock: 21_507_100,
  });
  const deployer = (await connection.ethers.getSigners())[0];
  const prepared = await prepareV3Implementation({
    hre,
    connection,
    repositoryRoot,
    runtimeRoot,
    signer: deployer,
  });

  assert.equal(
    (await inspectDeployment(connection.provider, {
      preparedImplementation: prepared.record.newImplementation,
    })).state,
    "prepared"
  );
  await verifyPreparedImplementationCode(connection.provider, prepared.record);

  const proxyAdminOwner = await impersonate(BASELINE.owner);
  await (
    await proxyAdminOwner.sendTransaction({
      to: prepared.record.upgradeProposal.to,
      data: prepared.record.upgradeProposal.data,
      value: 0n,
    })
  ).wait();

  const upgraded = await inspectDeployment(connection.provider, {
    preparedImplementation: prepared.record.newImplementation,
  });
  assert.equal(upgraded.state, "upgraded");
  assert.deepEqual(await verifyUpgradedConstants(connection.provider), {
    claimDeadline: 1_774_915_199,
    daoTreasury: "0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49",
  });

  const v3Artifact = await hre.artifacts.readArtifact("BottoLiquidityMiningV3");
  const erc20Abi = ["function balanceOf(address account) view returns (uint256)"];
  const proxy = new Contract(BASELINE.proxy, v3Artifact.abi, connection.ethers.provider);
  const botto = new Contract(BASELINE.bottoToken, erc20Abi, connection.ethers.provider);
  const lpAddress = await proxy.bottoEth();
  const lp = new Contract(lpAddress, erc20Abi, connection.ethers.provider);
  const stakedLp = await proxy.totalUserStake(staker);
  assert(stakedLp > 0n);

  const proxyBottoBefore = await botto.balanceOf(BASELINE.proxy);
  const treasuryBottoBefore = await botto.balanceOf(BASELINE.daoTreasury);
  const recovery = buildRecoveryProposal({ bottoBalance: proxyBottoBefore });
  await (
    await proxyAdminOwner.sendTransaction({
      to: recovery.to,
      data: recovery.data,
      value: 0n,
    })
  ).wait();
  assert.equal(await botto.balanceOf(BASELINE.proxy), 0n);
  assert.equal(
    (await botto.balanceOf(BASELINE.daoTreasury)) - treasuryBottoBefore,
    proxyBottoBefore
  );

  const stakerSigner = await impersonate(staker);
  const stakerLpBefore = await lp.balanceOf(staker);
  const stakerProxy = proxy.connect(stakerSigner);
  const [lpOut, reward] = await stakerProxy.withdraw.staticCall();
  assert.equal(lpOut, stakedLp);
  assert.equal(reward, 0n);
  await (await stakerProxy.withdraw()).wait();
  assert.equal((await lp.balanceOf(staker)) - stakerLpBefore, stakedLp);
  assert.equal(await proxy.totalUserStake(staker), 0n);

  console.log(
    `BIP-86 fork simulation passed at block ${BASELINE.forkBlock} with staker ${staker}.`
  );
} finally {
  await connection.close();
  rmSync(runtimeRoot, { recursive: true, force: true });
}
