#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GENERATED_DIR = "src/generated";

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function fixImports(filePath: string): boolean {
  const content = readFileSync(filePath, "utf-8");

  // Replace .js extensions in import/export statements
  let fixed = content.replace(/from ['"]([^'"]+)\.js['"]/g, 'from "$1"');

  // Fix bug in @mysten/codegen 0.5.0: Object -> object for object::ID check
  // This fixes the case-sensitive module name check in getPureBcsSchema
  if (filePath.includes("utils/index.ts")) {
    fixed = fixed.replace(
      /structTag\.module === "Object" && structTag\.name === "ID"/g,
      'structTag.module === "object" && structTag.name === "ID"',
    );
  }

  if (fixed !== content) {
    writeFileSync(filePath, fixed, "utf-8");
    return true;
  }

  return false;
}

const files = getAllTsFiles(GENERATED_DIR);
let _fixedCount = 0;

for (const file of files) {
  if (fixImports(file)) {
    _fixedCount++;
  }
}
