import { fileURLToPath } from "node:url";

import hre from "hardhat";

import { loadReproducibleBuild } from "../lib/artifact.js";
import { inspectDeployment } from "../lib/inspect.js";
import {
  readRecoveryContext,
  verifyPreparedImplementationCode,
  verifyUpgradedConstants,
} from "../lib/live.js";
import { buildRecoveryProposal } from "../lib/proposals.js";
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
      `recovery proposal requires upgraded state, observed ${inspection.state}`
    );
  }
  await verifyPreparedImplementationCode(connection.provider, record);
  const constants = await verifyUpgradedConstants(connection.provider);
  const recovery = await readRecoveryContext(connection.provider);
  const transaction = buildRecoveryProposal({
    bottoBalance: recovery.bottoBalance,
  });
  console.log(
    JSON.stringify(
      {
        verifiedState: inspection.state,
        blockNumber: recovery.blockNumber,
        timestamp: recovery.timestamp,
        constants,
        transaction,
      },
      null,
      2
    )
  );
} finally {
  await connection.close();
}
