/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * This example demonstrates a basic use of an owned object. Rules:
 *
 * - anyone can create an owned counter
 * - only the owner can increment a counter by 1
 * - only the owner can set the counter value
 */

import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index";
import * as object from "./deps/sui/object";

const $moduleName = "@local-pkg/counter::owned_counter";
export const OwnedCounter = new MoveStruct({
  name: `${$moduleName}::OwnedCounter`,
  fields: {
    id: object.UID,
    value: bcs.u64(),
  },
});
export interface NewOptions {
  package?: string;
  arguments?: [];
}
/** Create and transfer an OwnedCounter object to the sender. */
export function _new(options: NewOptions = {}) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "owned_counter",
      function: "new",
    });
}
export interface IncrementArguments {
  self: RawTransactionArgument<string>;
}
export interface IncrementOptions {
  package?: string;
  arguments: IncrementArguments | [self: RawTransactionArgument<string>];
}
/** Increment a counter by 1 (only owner can call this). */
export function increment(options: IncrementOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::owned_counter::OwnedCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "owned_counter",
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
/** Set value (only owner can call this since they own the object). */
export function setValue(options: SetValueOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::owned_counter::OwnedCounter`,
    "u64",
  ] satisfies string[];
  const parameterNames = ["self", "value"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "owned_counter",
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
  const argumentsTypes = [`${packageAddress}::owned_counter::OwnedCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "owned_counter",
      function: "value",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
