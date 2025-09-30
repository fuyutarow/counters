#!/usr/bin/env bun

/**
 * Sui Package IDからABI相当のmodule情報を生成するCLIスクリプト
 *
 * Usage:
 *   bun scripts/generate-move-types.ts [options]
 *   bun scripts/generate-move-types.ts --config suigen-config.json
 *   bun scripts/generate-move-types.ts --package-id 0x123... --package-name mypackage --network testnet
 *
 * Options:
 *   --config <file>         設定ファイルから読み込み (JSON形式)
 *   --package-id <id>       Package ID を直接指定
 *   --package-name <name>   Package name を指定
 *   --network <network>     Network (testnet/devnet/mainnet)
 *   --output-dir <dir>      出力ディレクトリ (default: src/abi)
 *   --help                  このヘルプを表示
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  getFullnodeUrl,
  SuiClient,
  type SuiMoveNormalizedModules,
  type SuiMoveNormalizedStruct,
  type SuiMoveNormalizedType,
} from "@mysten/sui/client";
import { Command } from "commander";
import { match, P } from "ts-pattern";
import { z } from "zod";

// Zodスキーマでバリデーション
const NetworkSchema = z.enum(["mainnet", "testnet", "devnet"]);

const PackageConfigSchema = z.object({
  name: z.string(),
  packageId: z.string(),
  description: z.string().optional(),
});

// CLIオプション用のスキーマ
const CLIOptionsSchema = z
  .object({
    network: z.enum(["mainnet", "testnet", "devnet"]),
    "package-name": z.string().min(1).optional(),
    "package-id": z.string().optional(),
    output: z.string().min(1),
    rpc: z.string().optional(),
    config: z.string().optional(),
  })
  .passthrough();

const SuigenConfigSchema = z.record(
  z.string(), // keyType (network名)
  z.object({
    // valueType
    packages: z.record(z.string(), z.string()), // packageName: packageId
  }),
);

const ConfigSchema = z.object({
  packages: z.record(z.string(), z.string()), // packageName: packageId
  network: NetworkSchema.optional(),
  outputDir: z.string().optional(),
  rpcUrl: z.string().url().optional(),
});

// 型をZodスキーマから推論
type PackageConfig = z.infer<typeof PackageConfigSchema>;
type SuigenConfig = z.infer<typeof SuigenConfigSchema>;
type Config = z.infer<typeof ConfigSchema>;

// CLI引数解析
function _parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (key === "help") {
        showHelp();
        process.exit(0);
      }
      if (value && !value.startsWith("--")) {
        options[key] = value;
        i++;
      } else {
        options[key] = "true";
      }
    }
  }

  return options;
}

function showHelp() {}

// 設定読み込み
function _loadConfig(options: Record<string, string>): PackageConfig[] {
  // Zodでバリデーション (必須フィールドもここでチェック)
  const validatedOptions = CLIOptionsSchema.parse(options);
  const network = validatedOptions.network;

  // 設定ファイルから読み込み
  if (validatedOptions.config) {
    if (!existsSync(validatedOptions.config)) {
      throw new Error(`設定ファイルが見つかりません: ${validatedOptions.config}`);
    }

    const configData: SuigenConfig = JSON.parse(readFileSync(validatedOptions.config, "utf8"));
    const networkConfig = configData[network];

    if (!networkConfig) {
      throw new Error(`Network "${network}" が設定ファイルに見つかりません`);
    }

    const packages = networkConfig.packages;
    if (!packages) {
      throw new Error(`Network "${network}" に packages が見つかりません`);
    }

    return Object.entries(packages).map(([name, packageId]) => ({
      name,
      packageId,
      description: `${name} package on ${network}`,
    }));
  }

  // CLI引数から単一パッケージ
  if (validatedOptions["package-id"]) {
    if (!validatedOptions["package-name"]) {
      throw new Error("Package name is required when package-id is specified");
    }
    return [
      {
        name: validatedOptions["package-name"],
        packageId: validatedOptions["package-id"],
        description: `${validatedOptions["package-name"]} package on ${network}`,
      },
    ];
  }

  throw new Error(`
Package設定が見つかりません。以下のいずれかを指定してください:
  - --config <file> で設定ファイルを指定（推奨）
  - --package-id <id> --package-name <name> でCLI引数直接指定

ヘルプ: --help
  `);
}

/**
 * Move型をTypeScript型文字列に変換
 */
function moveTypeToTypeScript(moveType: SuiMoveNormalizedType): string {
  return match(moveType)
    .with(P.string, (str) =>
      match(str)
        .with("Bool", () => "boolean")
        .with(P.union("U8", "U16", "U32"), () => "number")
        .with(P.union("U64", "U128", "U256", "Address"), () => "string")
        .otherwise(() => "unknown"),
    )
    .with({ Vector: P._ }, ({ Vector }) =>
      match(Vector)
        .with("U8", () => "Uint8Array")
        .otherwise(() => `${moveTypeToTypeScript(Vector)}[]`),
    )
    .with({ Reference: P._ }, ({ Reference }) => moveTypeToTypeScript(Reference))
    .with({ MutableReference: P._ }, ({ MutableReference }) =>
      moveTypeToTypeScript(MutableReference),
    )
    .with(
      {
        Struct: {
          module: "string",
          name: "String",
        },
      },
      () => "string",
    )
    .with(
      {
        Struct: {
          module: "vec_set",
          name: "VecSet",
          typeArguments: [P.any],
        },
      },
      ({ Struct }) => {
        const elementType = moveTypeToTypeScript(Struct.typeArguments?.[0]);
        return `${elementType}[]`;
      },
    )
    .with(
      {
        Struct: {
          module: P.union("table", "object_table"),
          name: P.union("Table", "ObjectTable"),
          typeArguments: [P.any, P.any],
        },
      },
      () => "{ id: string }", // GraphQLではIDのみが返される
    )
    .with(
      {
        Struct: {
          address: "0x2",
          module: "object",
          name: "UID",
        },
      },
      () => "{ id: string }",
    )
    .with({ Struct: P._ }, () => "unknown") // その他の構造体は一旦unknown
    .with({ TypeParameter: P._ }, () => "unknown")
    .otherwise(() => "unknown");
}

/**
 * 基本型（Sui上の実際の構造）を生成
 */
function generateTypeScriptInterface(
  moduleName: string,
  structName: string,
  struct: SuiMoveNormalizedStruct,
): string {
  const fields = struct.fields
    .map((field) => {
      const tsType = moveTypeToTypeScript(field.type);
      return `  ${field.name}: ${tsType};`;
    })
    .join("\n");

  const interfaceName = `${capitalize(moduleName)}${structName}Type`;

  return `export interface ${interfaceName} {
${fields}
}`;
}

/**
 * 型ガード関数を生成
 */
function generateTypeGuard(
  moduleName: string,
  structName: string,
  struct: SuiMoveNormalizedStruct,
): string {
  const stringFields = struct.fields
    .filter((field) => moveTypeToTypeScript(field.type) === "string")
    .map((field) => `"${field.name}"`);

  const allFields = struct.fields.map((field) => `"${field.name}"`);

  const interfaceName = `${capitalize(moduleName)}${structName}Type`;
  const functionName = `is${capitalize(moduleName)}${structName}Type`;

  return `export function ${functionName}(data: unknown): data is ${interfaceName} {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  // 必須フィールドの存在確認
  const requiredFields = [${allFields.join(", ")}];
  for (const field of requiredFields) {
    if (!(field in obj)) return false;
  }

  // string型フィールドの型確認
  const stringFields: string[] = [${stringFields.join(", ")}];
  for (const field of stringFields) {
    if (typeof obj[field] !== "string") return false;
  }

  return true;
}`;
}

/**
 * パース関数を生成
 */
function generateParseFunction(moduleName: string, structName: string): string {
  const interfaceName = `${capitalize(moduleName)}${structName}Type`;
  const functionName = `parse${capitalize(moduleName)}${structName}`;
  const guardName = `is${capitalize(moduleName)}${structName}Type`;

  return `export function ${functionName}(json: unknown): ${interfaceName} | null {
  return ${guardName}(json) ? json : null;
}`;
}

/**
 * ABI定義ファイルを生成
 */
function _generateAbiDefinition(packageName: string, modules: SuiMoveNormalizedModules): string {
  const header = `/**
 * ${packageName} package ABI definition with TypeScript interfaces
 * 自動生成されたファイル - 手動で編集しないでください
 * 
 * Generated by: scripts/suigenv0.ts
 * Generated at: ${new Date().toISOString()}
 */

import type { Transaction, TransactionArgument, TransactionResult } from "@mysten/sui/transactions";

`;

  const safePackageName = toValidIdentifier(packageName);
  const abiDefinition = `export const ${safePackageName}Abi = ${JSON.stringify(modules, null, 2)} as const;

export type ${capitalize(safePackageName)}Modules = typeof ${safePackageName}Abi;

`;

  // 各モジュールの構造体からTypeScriptインターフェースを生成
  const interfaces: string[] = [];
  const typeGuards: string[] = [];
  const parseFunctions: string[] = [];

  for (const [moduleName, moduleData] of Object.entries(modules)) {
    if ("structs" in moduleData && moduleData.structs) {
      for (const [structName, structData] of Object.entries(moduleData.structs)) {
        interfaces.push(generateTypeScriptInterface(moduleName, structName, structData));
        typeGuards.push(generateTypeGuard(moduleName, structName, structData));
        parseFunctions.push(generateParseFunction(moduleName, structName));
      }
    }
  }

  const generatedTypes =
    interfaces.length > 0
      ? `// Generated TypeScript interfaces\n${interfaces.join("\n\n")}\n\n` +
        `// Generated type guards\n${typeGuards.join("\n\n")}\n\n` +
        `// Generated parse functions\n${parseFunctions.join("\n\n")}\n\n`
      : "";

  // Tableメタデータコメントを生成
  const tableMetadata = generateTableMetadata(modules);
  const tableMetadataSection = tableMetadata ? `${tableMetadata}\n` : "";

  // Type-safe method-chaining API を生成
  const methodChainingApi = generateMethodChainingApi(safePackageName, modules);

  return header + abiDefinition + generatedTypes + tableMetadataSection + methodChainingApi;
}

/**
 * Struct情報をパラメータから抽出
 */
function extractStructFromParam(
  param: SuiMoveNormalizedType,
): { address: string; module: string; name: string } | null {
  return match(param)
    .with({ Reference: { Struct: P._ } }, ({ Reference }) => Reference.Struct)
    .with({ MutableReference: { Struct: P._ } }, ({ MutableReference }) => MutableReference.Struct)
    .with({ Struct: P._ }, ({ Struct }) => Struct)
    .otherwise(() => null);
}

/**
 * 暗黙的パラメータ（システムが自動的に追加）かどうかを判定
 */
function isImplicitParameter(param: SuiMoveNormalizedType): boolean {
  const struct = extractStructFromParam(param);
  // Sui SDKが自動的に処理する暗黙的パラメータ（TxContextのみ）
  // Clock、Randomはユーザーが明示的に渡す必要があります
  return match(struct)
    .with({ address: "0x2", module: "tx_context", name: "TxContext" }, () => true)
    .otherwise(() => false);
}

/**
 * Tableメタデータコメントを生成（データ取得は規定せず、型情報のみ提供）
 */
function generateTableMetadata(modules: SuiMoveNormalizedModules): string {
  const tableTypes = new Set<string>();
  const metadata: string[] = [];

  // すべてのモジュールからTable型を抽出
  for (const [_moduleName, moduleData] of Object.entries(modules)) {
    if ("structs" in moduleData && moduleData.structs) {
      for (const [_structName, structData] of Object.entries(moduleData.structs)) {
        for (const field of structData.fields) {
          match(field.type)
            .with(
              {
                Struct: {
                  module: P.union("table", "object_table"),
                  name: P.union("Table", "ObjectTable"),
                  typeArguments: [P.any, P.any],
                },
              },
              ({ Struct }) => {
                const keyType = moveTypeToTypeScript(Struct.typeArguments?.[0]);
                const valueType = moveTypeToTypeScript(Struct.typeArguments?.[1]);
                const tableTypeKey = `${keyType}_${valueType}`;

                if (!tableTypes.has(tableTypeKey)) {
                  tableTypes.add(tableTypeKey);
                  const safeKeyType = match(keyType)
                    .with("Uint8Array", () => "string")
                    .otherwise(() => keyType);

                  metadata.push(`
/**
 * Table<${keyType}, ${valueType}> metadata
 *
 * Base type: { id: string }
 * Resolved type: Record<${safeKeyType}, ${valueType}>
 *
 * Usage:
 * 1. Get table ID from base type
 * 2. Fetch table contents using your preferred method (GraphQL, gRPC, etc.)
 * 3. Parse contents into resolved type
 *
 * Example:
 *   const tableId = data.fieldName.id;
 *   const contents = await fetchTableContents(tableId);
 *   const resolvedData: ResolvedType = { ...data, fieldName: contents };
 */`);
                }
              },
            )
            .otherwise(() => {});
        }
      }
    }
  }

  return metadata.length > 0 ? `// Table types metadata\n${metadata.join("\n")}\n` : "";
}

/**
 * Method-chaining APIを生成
 */
function generateMethodChainingApi(packageName: string, modules: SuiMoveNormalizedModules): string {
  // Generate method-chaining API for each module
  const moduleApis: string[] = [];

  for (const [moduleName, moduleData] of Object.entries(modules)) {
    const functionMethods: string[] = [];

    if (moduleData.exposedFunctions) {
      for (const [functionName, functionData] of Object.entries(moduleData.exposedFunctions)) {
        // 暗黙的パラメータを除外して実際のユーザーパラメータ数を取得
        const userParams = functionData.parameters.filter((param) => !isImplicitParameter(param));
        const userParamCount = userParams.length;
        const hasTypeParams = functionData.typeParameters.length > 0;

        const methodSignature = match(userParamCount)
          .with(
            0,
            () =>
              // 引数なし（TxContextのみなど）
              `    ${functionName}(
      tx: Transaction
    ): TransactionResult {
      return tx.moveCall({
        target: \`\${packageId}::${moduleName}::${functionName}\`,
        arguments: [],
      });
    }`,
          )
          .otherwise(() => {
            // タプル型で正確な引数個数を指定
            const tupleType = `readonly [${Array(userParamCount).fill("TransactionArgument").join(", ")}]`;
            return `    ${functionName}(
      tx: Transaction,
      options: {
        arguments: ${tupleType};${hasTypeParams ? "\n        typeArguments?: readonly string[];" : ""}
      }
    ): TransactionResult {
      return tx.moveCall({
        target: \`\${packageId}::${moduleName}::${functionName}\`,${hasTypeParams ? "\n        ...(options.typeArguments?.length && { typeArguments: options.typeArguments as string[] })," : ""}
        arguments: [...options.arguments],
      });
    }`;
          });

        functionMethods.push(methodSignature);
      }
    }

    if (functionMethods.length > 0) {
      moduleApis.push(`  ${moduleName}: {
${functionMethods.join(",\n")}
  }`);
    }
  }

  return `
// Extract packageId once at module level for better performance
const packageId = Object.values(${packageName}Abi)[0]?.address;
if (!packageId) {
  throw new Error("Package ID not found in ${packageName} ABI");
}

// Type-safe method-chaining API
export const ${packageName}Package = {
  abi: ${packageName}Abi,
  packageId,
${moduleApis.join(",\n")}
} as const;
`;
}

/**
 * 文字列の最初の文字を大文字にする
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toValidIdentifier(name: string): string {
  // kebab-case (foo-bar) と snake_case (foo_bar) を camelCase (fooBar) に変換
  return name.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * TypeScript bindings生成
 */
async function generateTypeScriptBindings(
  packageName: string,
  _packageId: string,
  modules: SuiMoveNormalizedModules,
): Promise<string> {
  return _generateAbiDefinition(packageName, modules);
}

/**
 * 単一パッケージのABI生成
 */
async function generateABI(
  packageName: string,
  packageId: string,
  outputDir: string,
  network: string,
  rpcUrl?: string,
): Promise<void> {
  // Initialize Sui client with Zod validation
  const targetNetwork = NetworkSchema.safeParse(network).success
    ? NetworkSchema.parse(network)
    : "testnet";
  const rpcEndpoint = rpcUrl ?? getFullnodeUrl(targetNetwork);
  const client = new SuiClient({ url: rpcEndpoint });

  // Get package info
  const packageInfo = await client.getNormalizedMoveModulesByPackage({
    package: packageId,
  });

  if (!packageInfo || Object.keys(packageInfo).length === 0) {
    throw new Error(`Package not found: ${packageId}`);
  }

  // Debug: Log all modules and their addresses
  if (process.env.DEBUG) {
    for (const [_moduleName, _moduleData] of Object.entries(packageInfo)) {
    }
  }

  // Filter modules to only include those from the specified package
  // This prevents including dependent package modules in the generated ABI
  const filteredModules = Object.fromEntries(
    Object.entries(packageInfo).filter(([_moduleName, moduleData]) => {
      const isOwnModule = moduleData.address === packageId;
      if (process.env.DEBUG) {
      }
      return isOwnModule;
    }),
  );

  if (Object.keys(filteredModules).length === 0) {
    throw new Error(`No modules found for package ${packageId}`);
  }

  if (process.env.DEBUG) {
  }

  // Generate TypeScript bindings using filtered modules
  const tsContent = await generateTypeScriptBindings(packageName, packageId, filteredModules);

  // Write to file
  const outputPath = path.join(outputDir, `${packageName}.abi.ts`);
  writeFileSync(outputPath, tsContent);
}

/**
 * メイン実行関数
 */
/**
 * index.tsファイルを生成する
 */
async function generateIndexFile(
  outputDir: string,
  packages: Record<string, string>,
): Promise<void> {
  const configs = Object.entries(packages).map(([name, packageId]) => ({
    name,
    packageId,
  }));

  const header = `/**
 * Unified ABI exports for all packages
 * 自動生成されたファイル - 手動で編集しないでください
 *
 * Generated by: scripts/suigenv0.ts
 * Generated at: ${new Date().toISOString()}
 */

`;

  // すべてのexportをre-export（型、関数など）
  const reExports = configs.map((config) => `export * from "./${config.name}.abi";`).join("\n");

  // パッケージオブジェクトの明示的なre-export（名前の重複を防ぐため）
  const packageExports = configs
    .map((config) => {
      const packageName = `${toValidIdentifier(config.name)}Package`;
      return `export { ${packageName} } from "./${config.name}.abi";`;
    })
    .join("\n");

  const content = `${header}// Re-export all types and utilities\n${reExports}\n// Explicit re-exports for package objects\n${packageExports}\n`;
  const outputPath = path.join(outputDir, "index.ts");
  writeFileSync(outputPath, content);
}

async function main() {
  const program = new Command();

  program
    .name("suigen")
    .description("Generate TypeScript bindings from Sui Move packages")
    .version("0.1.0")
    .option("-c, --config <path>", "Path to config file", "suigen-config.json")
    .option("-o, --output <dir>", "Output directory")
    .option("-n, --network <network>", "Sui network (testnet, mainnet, devnet)")
    .option("-r, --rpc <url>", "Custom RPC URL")
    .option("--debug", "Enable debug logging")
    .helpOption("-h, --help", "Display help for command")
    .addHelpText(
      "after",
      `
Examples:
  $ bun scripts/suigenv0.ts --config suigen-config.json
  $ bun scripts/suigenv0.ts -c my-config.json -o ./generated
  $ bun scripts/suigenv0.ts -c config.json -n mainnet

Config file format (JSON):
{
  "packages": {
    "package1": "0x123...",
    "package2": "0x456..."
  },
  "network": "testnet",
  "outputDir": "src/abi"
}
`,
    );

  program.action(async (options) => {
    if (options.debug) {
      process.env.DEBUG = "true";
    }

    try {
      // Zodでバリデーション
      const validatedOptions = CLIOptionsSchema.parse(options);

      // Load config file
      let config: Config = { packages: {} };
      if (existsSync(validatedOptions.config)) {
        const configContent = readFileSync(validatedOptions.config, "utf-8");
        const rawConfig = JSON.parse(configContent);

        // Check if it's the old format with networks
        if (rawConfig.testnet || rawConfig.devnet || rawConfig.mainnet) {
          const network = validatedOptions.network;
          const networkConfig = rawConfig[network];
          if (networkConfig?.packages) {
            config = {
              packages: networkConfig.packages,
              network: network,
              outputDir: validatedOptions.output,
            };
          } else {
            throw new Error(`Network "${network}" not found in config file`);
          }
        } else {
          // New format
          config = rawConfig;
        }
      } else {
        process.exit(1);
      }

      // CLI options override config
      const outputDir = validatedOptions.output;
      const network = validatedOptions.network;
      const rpcUrl = validatedOptions.rpc ?? config.rpcUrl;

      if (Object.keys(config.packages).length === 0) {
        process.exit(1);
      }

      // Create output directory
      mkdirSync(outputDir, { recursive: true });

      // Generate for each package
      for (const [packageName, packageId] of Object.entries(config.packages)) {
        await generateABI(packageName, packageId, outputDir, network, rpcUrl);
      }
      await generateIndexFile(outputDir, config.packages);
    } catch (_error) {
      if (options.debug) {
      }
      process.exit(1);
    }
  });

  await program.parseAsync();
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((_error) => {
    process.exit(1);
  });
}

export { main };
