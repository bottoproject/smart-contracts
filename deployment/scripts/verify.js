import { fileURLToPath } from "node:url";

import hre from "hardhat";

import { loadReproducibleBuild } from "../lib/artifact.js";
import { inspectDeployment } from "../lib/inspect.js";
import {
  verifyPreparedImplementationCode,
  verifyUpgradedConstants,
} from "../lib/live.js";
import {
  assertRecordMatchesReproducibleBuild,
  loadPreparationRecord,
} from "../lib/record.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const record = assertRecordMatchesReproducibleBuild(
  loadPreparationRecord(repositoryRoot),
  loadReproducibleBuild(repositoryRoot)
);

const connection = await hre.network.create();
try {
  const inspection = await inspectDeployment(connection.provider, {
    preparedImplementation: record.newImplementation,
  });
  if (inspection.state !== "upgraded") {
    throw new Error(
      `post-upgrade verification requires upgraded state, observed ${inspection.state}`
    );
  }
  const deployedSha256 = await verifyPreparedImplementationCode(
    connection.provider,
    record
  );
  const constants = await verifyUpgradedConstants(connection.provider);
  console.log(
    JSON.stringify({ inspection, deployedSha256, constants }, null, 2)
  );
} finally {
  await connection.close();
}
