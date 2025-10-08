/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * This example demonstrates an owned counter that stores its data in Walrus. The
 * counter object wraps a Walrus Blob which contains the counter data. Rules:
 *
 * - anyone can create a walrus counter by wrapping a Blob
 * - only the owner can unwrap and retrieve the Blob
 */

import { type Transaction } from "@mysten/sui/transactions";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index";
import * as object from "./deps/sui/object";
import * as blob from "./deps/walrus/blob";

const $moduleName = "@local-pkg/counter::walrus_counter";
export const WalrusCounter = new MoveStruct({
  name: `${$moduleName}::WalrusCounter`,
  fields: {
    id: object.UID,
    blob: blob.Blob,
  },
});
export interface WrapArguments {
  blob: RawTransactionArgument<string>;
}
export interface WrapOptions {
  package?: string;
  arguments: WrapArguments | [blob: RawTransactionArgument<string>];
}
/** Create and return a new WalrusCounter by wrapping a Blob. */
export function wrap(options: WrapOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    "0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66::blob::Blob",
  ] satisfies string[];
  const parameterNames = ["blob"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "walrus_counter",
      function: "wrap",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UnwrapArguments {
  self: RawTransactionArgument<string>;
}
export interface UnwrapOptions {
  package?: string;
  arguments: UnwrapArguments | [self: RawTransactionArgument<string>];
}
/** Unwrap and return the Blob (only owner can call this). */
export function unwrap(options: UnwrapOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::walrus_counter::WalrusCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "walrus_counter",
      function: "unwrap",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
