const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const solc = require("solc");

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return path.resolve(process.argv[index + 1]);
}

function digestBytecode(bytecode, label) {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(bytecode)) {
    throw new Error(`${label} must be non-empty, fully linked hex bytecode`);
  }

  const bytes = Buffer.from(bytecode.slice(2), "hex");
  return {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function digestFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function main() {
  const artifactPath = readArgument("--artifact");
  const outputPath = readArgument("--output");
  const projectRoot = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(
    readFileSync(path.join(projectRoot, "package.json"), "utf8")
  );
  const trufflePackage = JSON.parse(
    readFileSync(require.resolve("truffle/package.json"), "utf8")
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const metadata = JSON.parse(artifact.metadata);

  if (process.versions.node !== packageJson.engines.node) {
    throw new Error(
      `Node ${packageJson.engines.node} is required; found ${process.versions.node}`
    );
  }

  const expectedNpm = packageJson.packageManager.replace(/^npm@/, "");
  if (!process.env.npm_execpath) {
    throw new Error("Run this build through the pinned npm script");
  }
  const npmVersion = execFileSync(
    process.execPath,
    [process.env.npm_execpath, "--version"],
    { encoding: "utf8" }
  ).trim();
  if (npmVersion !== expectedNpm || npmVersion !== packageJson.engines.npm) {
    throw new Error(`npm ${expectedNpm} is required; found ${npmVersion}`);
  }
  if (trufflePackage.version !== packageJson.devDependencies.truffle) {
    throw new Error(
      `Truffle ${packageJson.devDependencies.truffle} is required; found ${trufflePackage.version}`
    );
  }
  const expectedSolc = packageJson.devDependencies.solc;
  const solcVersion = solc.version();
  if (
    artifact.compiler.name !== "solc" ||
    !artifact.compiler.version.startsWith(`${expectedSolc}+`) ||
    artifact.compiler.version !== solcVersion
  ) {
    throw new Error(
      `Expected installed solc ${expectedSolc}; artifact has ${artifact.compiler.name} ${artifact.compiler.version}, installed compiler is ${solcVersion}`
    );
  }
  const solcJsSha256 = digestFile(require.resolve("solc/soljson.js"));

  const creation = digestBytecode(artifact.bytecode, "Creation bytecode");
  const deployed = digestBytecode(
    artifact.deployedBytecode,
    "Deployed bytecode"
  );
  const manifest = {
    schemaVersion: 1,
    contract: artifact.contractName,
    toolchain: {
      node: packageJson.engines.node,
      npm: npmVersion,
      truffle: trufflePackage.version,
      solc: solcVersion,
      solcJsSha256,
    },
    compilerSettings: canonicalize(metadata.settings),
    bytecode: {
      creationBytes: creation.bytes,
      creationSha256: creation.sha256,
      deployedBytes: deployed.bytes,
      deployedSha256: deployed.sha256,
    },
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

main();
