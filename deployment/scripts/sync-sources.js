import { fileURLToPath } from "node:url";

import { syncSoliditySources } from "../lib/sources.js";

const sourceDirectory = fileURLToPath(new URL("../../contracts", import.meta.url));
const destinationDirectory = fileURLToPath(
  new URL("../project:/contracts", import.meta.url)
);

const copied = syncSoliditySources(sourceDirectory, destinationDirectory);
console.log(`Synchronized ${copied.length} Solidity sources for Hardhat validation.`);
