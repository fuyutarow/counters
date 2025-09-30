/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * This example demonstrates a basic use of a shared object. Rules:
 *
 * - anyone can create and share a counter
 * - everyone can increment a counter by 1
 * - the owner of the counter can reset it to any value
 */

import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index";
import * as object from "./deps/sui/object";

const $moduleName = "@local-pkg/counter::shared_counter";
export const SharedCounter = new MoveStruct({
  name: `${$moduleName}::SharedCounter`,
  fields: {
    id: object.UID,
    value: bcs.u64(),
  },
});
export interface ShareOptions {
  package?: string;
  arguments?: [];
}
/** Create and share a SharedCounter object. */
export function share(options: ShareOptions = {}) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "shared_counter",
      function: "share",
    });
}
export interface IncrementArguments {
  self: RawTransactionArgument<string>;
}
export interface IncrementOptions {
  package?: string;
  arguments: IncrementArguments | [self: RawTransactionArgument<string>];
}
/** Increment a counter by 1. */
export function increment(options: IncrementOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::shared_counter::SharedCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "shared_counter",
      function: "increment",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetValueArguments {
  self: RawTransactionArgument<string>;
  value: RawTransactionArgument<number | bigint>;
}
export interface SetValueOptions {
  package?: string;
  arguments:
    | SetValueArguments
    | [self: RawTransactionArgument<string>, value: RawTransactionArgument<number | bigint>];
}
/** Set value (only runnable by the SharedCounter owner) */
export function setValue(options: SetValueOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::shared_counter::SharedCounter`,
    "u64",
  ] satisfies string[];
  const parameterNames = ["self", "value"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "shared_counter",
      function: "set_value",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ValueArguments {
  self: RawTransactionArgument<string>;
}
export interface ValueOptions {
  package?: string;
  arguments: ValueArguments | [self: RawTransactionArgument<string>];
}
/** Get the current counter value. */
export function value(options: ValueOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::shared_counter::SharedCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "shared_counter",
      function: "value",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
