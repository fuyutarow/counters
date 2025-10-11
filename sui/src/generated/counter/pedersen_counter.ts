/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * Pedersen Commitment Counter using homomorphic properties
 *
 * This counter uses Pedersen commitments to hide the actual counter value while
 * allowing homomorphic addition through elliptic curve operations.
 *
 * Commitment: C = value _ G + blinding _ H Where G and H are generators on the
 * BLS12-381 G1 curve
 *
 * Homomorphic property: C1 + C2 = (v1 + v2) _ G + (r1 + r2) _ H This allows
 * incrementing the counter without revealing the value.
 */

import { type Transaction } from "@mysten/sui/transactions";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index";
import * as group_ops from "./deps/sui/group_ops";
import * as object from "./deps/sui/object";

const $moduleName = "@local-pkg/counter::pedersen_counter";
export const PedersenCounter = new MoveStruct({
  name: `${$moduleName}::PedersenCounter`,
  fields: {
    id: object.UID,
    /** The commitment to the counter value: C = value _ G + blinding _ H */
    commitment: group_ops.Element,
  },
});
export interface NewArguments {
  commitmentBytes: RawTransactionArgument<number[]>;
}
export interface NewOptions {
  package?: string;
  arguments: NewArguments | [commitmentBytes: RawTransactionArgument<number[]>];
}
/**
 * Create a new Pedersen counter with initial commitment @param commitment_bytes:
 * Serialized G1 point (48 bytes compressed)
 */
export function _new(options: NewOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = ["vector<u8>"] satisfies string[];
  const parameterNames = ["commitmentBytes"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "pedersen_counter",
      function: "new",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IncrementArguments {
  self: RawTransactionArgument<string>;
  valueCommitmentBytes: RawTransactionArgument<number[]>;
}
export interface IncrementOptions {
  package?: string;
  arguments:
    | IncrementArguments
    | [
        self: RawTransactionArgument<string>,
        valueCommitmentBytes: RawTransactionArgument<number[]>,
      ];
}
/**
 * Increment the counter homomorphically by adding a commitment @param
 * value_commitment_bytes: Serialized G1 point (48 bytes compressed) C_new =
 * C_old + C_inc
 */
export function increment(options: IncrementOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::pedersen_counter::PedersenCounter`,
    "vector<u8>",
  ] satisfies string[];
  const parameterNames = ["self", "valueCommitmentBytes"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "pedersen_counter",
      function: "increment",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CommitmentBytesArguments {
  self: RawTransactionArgument<string>;
}
export interface CommitmentBytesOptions {
  package?: string;
  arguments: CommitmentBytesArguments | [self: RawTransactionArgument<string>];
}
/** Get the commitment bytes for external verification (48 bytes compressed) */
export function commitmentBytes(options: CommitmentBytesOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::pedersen_counter::PedersenCounter`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "pedersen_counter",
      function: "commitment_bytes",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
