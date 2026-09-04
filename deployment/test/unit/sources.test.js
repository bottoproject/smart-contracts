import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { syncSoliditySources } from "../../lib/sources.js";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("copies the authoritative contracts into Hardhat's Truffle-compatible source namespace", () => {
  const root = mkdtempSync(join(tmpdir(), "botto-source-sync-"));
  temporaryDirectories.push(root);
  const source = join(root, "contracts");
  const destination = join(root, "deployment", "project:", "contracts");
  mkdirSync(join(source, "nested"), { recursive: true });
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(source, "A.sol"), "contract A {}\n");
  writeFileSync(join(source, "nested", "B.sol"), "contract B {}\n");
  writeFileSync(join(destination, "stale.sol"), "stale\n");

  const copied = syncSoliditySources(source, destination);

  assert.deepEqual(copied, ["A.sol", "nested/B.sol"]);
  assert.equal(readFileSync(join(destination, "A.sol"), "utf8"), "contract A {}\n");
  assert.equal(
    readFileSync(join(destination, "nested", "B.sol"), "utf8"),
    "contract B {}\n"
  );
  assert.throws(() => readFileSync(join(destination, "stale.sol")), /ENOENT/);
});
