/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index";
import * as object from "./deps/sui/object";
import * as blob_1 from "./deps/walrus/blob";

const $moduleName = "@local-pkg/counter::walrus_counter";
export const WalrusCounter = new MoveStruct({
  name: `${$moduleName}::WalrusCounter`,
  fields: {
    id: object.UID,
    blob: bcs.option(blob_1.Blob),
  },
});
export interface NewArguments {
  blob: RawTransactionArgument<string>;
}
export interface NewOptions {
  package?: string;
  arguments: NewArguments | [blob: RawTransactionArgument<string>];
}
export function _new(options: NewOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::blob::Blob`] satisfies string[];
  const parameterNames = ["blob"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "walrus_counter",
      function: "new",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReplaceArguments {
  self: RawTransactionArgument<string>;
  newBlob: RawTransactionArgument<string>;
}
export interface ReplaceOptions {
  package?: string;
  arguments:
    | ReplaceArguments
    | [self: RawTransactionArgument<string>, newBlob: RawTransactionArgument<string>];
}
export function replace(options: ReplaceOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::walrus_counter::WalrusCounter`,
    `${packageAddress}::blob::Blob`,
  ] satisfies string[];
  const parameterNames = ["self", "newBlob"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "walrus_counter",
      function: "replace",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BlobArguments {
  self: RawTransactionArgument<string>;
}
export interface BlobOptions {
  package?: string;
  arguments: BlobArguments | [self: RawTransactionArgument<string>];
}
export function blob(options: BlobOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::walrus_counter::WalrusCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "walrus_counter",
      function: "blob",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TakeArguments {
  self: RawTransactionArgument<string>;
}
export interface TakeOptions {
  package?: string;
  arguments: TakeArguments | [self: RawTransactionArgument<string>];
}
export function take(options: TakeOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::walrus_counter::WalrusCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "walrus_counter",
      function: "take",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
