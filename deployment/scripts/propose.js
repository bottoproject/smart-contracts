import { join } from "node:path";
import { fileURLToPath } from "node:url";

import hre from "hardhat";

import {
  loadReproducibleBuild,
  sha256File,
} from "../lib/artifact.js";
import { inspectDeployment } from "../lib/inspect.js";
import { verifyPreparedImplementationCode } from "../lib/live.js";
import {
  assertRecordMatchesReproducibleBuild,
  loadPreparationRecord,
} from "../lib/record.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = join(
  repositoryRoot,
  "deployments/builds/BottoLiquidityMiningV3.json"
);
const manifest = loadReproducibleBuild(repositoryRoot);
const record = assertRecordMatchesReproducibleBuild(
  loadPreparationRecord(repositoryRoot),
  manifest
);
const manifestHash = sha256File(manifestPath);
if (manifestHash !== record.bytecode.artifactSha256) {
  throw new Error(
    `reproducible manifest hash mismatch: expected ${record.bytecode.artifactSha256}, observed ${manifestHash}`
  );
}

const connection = await hre.network.create();
try {
  const inspection = await inspectDeployment(connection.provider, {
    preparedImplementation: record.newImplementation,
  });
  if (inspection.state !== "prepared") {
    throw new Error(
      `upgrade proposal requires prepared state, observed ${inspection.state}`
    );
  }
  const deployedSha256 = await verifyPreparedImplementationCode(
    connection.provider,
    record
  );
  console.log(
    JSON.stringify(
      {
        verifiedState: inspection.state,
        deployedSha256,
        transaction: record.upgradeProposal,
      },
      null,
      2
    )
  );
} finally {
  await connection.close();
}
