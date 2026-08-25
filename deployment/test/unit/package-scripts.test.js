import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8")
);

describe("deployment workspace package scripts", () => {
  test("does not use npm lifecycle names for privileged deployment commands", () => {
    assert.equal(packageJson.scripts.prepare, undefined);
  });
});
