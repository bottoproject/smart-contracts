import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

function listSolidityFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSolidityFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".sol")) {
      files.push(entryPath);
    }
  }

  return files;
}

export function syncSoliditySources(sourceDirectory, destinationDirectory) {
  const sourceFiles = listSolidityFiles(sourceDirectory);
  rmSync(destinationDirectory, { recursive: true, force: true });

  const copied = [];
  for (const sourceFile of sourceFiles) {
    const relativePath = relative(sourceDirectory, sourceFile);
    const destinationFile = join(destinationDirectory, relativePath);
    mkdirSync(join(destinationFile, ".."), { recursive: true });
    copyFileSync(sourceFile, destinationFile);
    copied.push(relativePath.split(sep).join("/"));
  }

  return copied.sort();
}
