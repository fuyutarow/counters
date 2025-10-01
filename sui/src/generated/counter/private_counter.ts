/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * Private Counter with ZK Proof (+1 only increment)
 *
 * This module implements a privacy-preserving counter where:
 *
 * - The counter value is never revealed on-chain (stored as commitment)
 * - Only +1 increments are allowed (enforced by ZK circuit)
 * - Uses Groth16 proof system with BN254 curve
 * - Poseidon hash for ZK-friendly commitments
 *
 * Security properties:
 *
 * - Verification key is fixed at creation (prevents circuit swapping)
 * - State binding ensures old commitment matches on-chain state
 * - ZK circuit enforces: salt proof, valid old commitment, +1 increment, range
 *   constraint
 */

import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index";
import * as object from "./deps/sui/object";

const $moduleName = "@local-pkg/counter::private_counter";
export const PrivateCounter = new MoveStruct({
  name: `${$moduleName}::PrivateCounter`,
  fields: {
    id: object.UID,
    salt_hash: bcs.u256(),
    value_hash: bcs.u256(),
    vk_hash: bcs.u256(),
  },
});
export interface NewArguments {
  initialValueHash: RawTransactionArgument<number | bigint>;
  saltValue: RawTransactionArgument<number | bigint>;
  verifyingKeyBytes: RawTransactionArgument<number[]>;
}
export interface NewOptions {
  package?: string;
  arguments:
    | NewArguments
    | [
        initialValueHash: RawTransactionArgument<number | bigint>,
        saltValue: RawTransactionArgument<number | bigint>,
        verifyingKeyBytes: RawTransactionArgument<number[]>,
      ];
}
/**
 * Creates a new private counter with initial value hash. Returns an owned object
 * that can be transferred to the desired owner.
 *
 * @param initial_value_hash: Poseidon(v_0, r_0) - hash of initial value with
 * randomness @param salt_value: Salt value for Poseidon hashing @param
 * verifying_key_bytes: Groth16 verifying key (serialized bytes) @param ctx:
 * Transaction context @return: New PrivateCounter object (owned)
 */
export function _new(options: NewOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = ["u256", "u256", "vector<u8>"] satisfies string[];
  const parameterNames = ["initialValueHash", "saltValue", "verifyingKeyBytes"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "private_counter",
      function: "new",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IncrementArguments {
  self: RawTransactionArgument<string>;
  proofBytes: RawTransactionArgument<number[]>;
  publicInputsBytes: RawTransactionArgument<number[]>;
  verifyingKeyBytes: RawTransactionArgument<number[]>;
}
export interface IncrementOptions {
  package?: string;
  arguments:
    | IncrementArguments
    | [
        self: RawTransactionArgument<string>,
        proofBytes: RawTransactionArgument<number[]>,
        publicInputsBytes: RawTransactionArgument<number[]>,
        verifyingKeyBytes: RawTransactionArgument<number[]>,
      ];
}
/**
 * Increments the counter by 1 with ZK proof verification. Only the owner of this
 * object can call this function (enforced by ownership).
 *
 * The proof must demonstrate:
 *
 * 1.  Knowledge of salt: Poseidon(salt) = salt_hash
 * 2.  Valid old hash: h_old = Poseidon(v, r)
 * 3.  +1 increment: h_new = Poseidon(v+1, r')
 * 4.  Range constraint: v is within valid range
 *
 * @param self: Mutable reference to the counter (owner only) @param proof_bytes:
 * Groth16 proof points (serialized) @param public_inputs_bytes: Public inputs
 * (salt_hash || h_old || h_new) @param verifying_key_bytes: Verifying key bytes
 * (same format as used in new())
 */
export function increment(options: IncrementOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::private_counter::PrivateCounter`,
    "vector<u8>",
    "vector<u8>",
    "vector<u8>",
  ] satisfies string[];
  const parameterNames = ["self", "proofBytes", "publicInputsBytes", "verifyingKeyBytes"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "private_counter",
      function: "increment",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ValueHashArguments {
  self: RawTransactionArgument<string>;
}
export interface ValueHashOptions {
  package?: string;
  arguments: ValueHashArguments | [self: RawTransactionArgument<string>];
}
/** Returns the current value hash (does not reveal actual value) */
export function valueHash(options: ValueHashOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::private_counter::PrivateCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "private_counter",
      function: "value_hash",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SaltHashArguments {
  self: RawTransactionArgument<string>;
}
export interface SaltHashOptions {
  package?: string;
  arguments: SaltHashArguments | [self: RawTransactionArgument<string>];
}
/** Returns the salt hash (Poseidon hash) */
export function saltHash(options: SaltHashOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::private_counter::PrivateCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "private_counter",
      function: "salt_hash",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VerifyingKeyHashArguments {
  self: RawTransactionArgument<string>;
}
export interface VerifyingKeyHashOptions {
  package?: string;
  arguments: VerifyingKeyHashArguments | [self: RawTransactionArgument<string>];
}
/** Returns the verifying key hash (Blake2b256 hash) */
export function verifyingKeyHash(options: VerifyingKeyHashOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [`${packageAddress}::private_counter::PrivateCounter`] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "private_counter",
      function: "verifying_key_hash",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
