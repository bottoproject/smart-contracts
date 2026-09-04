import hre from "hardhat";

import { inspectDeployment } from "../lib/inspect.js";

const connection = await hre.network.create();
const inspection = await inspectDeployment(connection.provider);
console.log(JSON.stringify(inspection, null, 2));
await connection.close();
