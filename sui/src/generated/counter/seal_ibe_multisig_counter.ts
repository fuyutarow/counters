/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * Seal IBE Multi-signature Counter with SEAL derived keys
 *
 * This module protects a counter using **SEAL IBE-derived keys as signatures**
 * with public-key aggregation for gas efficiency. Threshold is enforced as a
 * **policy** (t-of-n verified signers), not as a cryptographic threshold scheme.
 *
 * Key features:
 *
 * - Store SEAL IBE public keys directly (PoP checked off-chain on registration)
 * - Verify aggregated derived signatures against aggregated public keys using
 *   **pairing equations** instead of standard BLS verification
 * - **t-of-n policy**: require at least `threshold` distinct registered signers
 *
 * Flow:
 *
 * 1.  Create `SealIbeMultisigConfig` with registered public keys (G2) and
 *     threshold
 * 2.  Share `SealIbeMultisigCounter` linked to the config
 * 3.  Off-chain: each participant derives keys for the same message using SEAL IBE
 * 4.  Off-chain: aggregate derived signatures and aggregate the corresponding
 *     public keys
 * 5.  On-chain: verify using pairing equation e(σ, g₂) = e(H₁(FullID), Σmpk_i)
 * 6.  Use the proof to increment the counter
 *
 * Message definition (must match signing side exactly): FullID := package_id ||
 * counter_id || signer_address || (DST_SEAL_MSG_DOMAIN || message) H1_input :=
 * DST_SEAL_IBE_ID || FullID msg_G1 := hash_to_g1(H1_input)
 *
 * Security notes:
 *
 * - Requires **Proof of Possession (PoP)** for each stored public key to prevent
 *   rogue-key attacks
 * - Uses SEAL IBE-derived signatures, NOT standard BLS signatures
 * - Enforces uniqueness and membership of contributing signers
 */

import { bcs } from "@mysten/sui/bcs";
import { type Transaction } from "@mysten/sui/transactions";
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from "../utils/index";
import * as group_ops from "./deps/sui/group_ops";
import * as object from "./deps/sui/object";
import * as table from "./deps/sui/table";

const $moduleName = "@local-pkg/counter::seal_ibe_multisig_counter";
export const PackageMarker = new MoveStruct({
  name: `${$moduleName}::PackageMarker`,
  fields: {
    dummy_field: bcs.bool(),
  },
});
export const SealIbeMultisigConfig = new MoveStruct({
  name: `${$moduleName}::SealIbeMultisigConfig`,
  fields: {
    seal_ibe_table: table.Table,
    threshold: bcs.u64(),
  },
});
export const SealIbeMultisigCounter = new MoveStruct({
  name: `${$moduleName}::SealIbeMultisigCounter`,
  fields: {
    id: object.UID,
    value: bcs.u64(),
    config: SealIbeMultisigConfig,
  },
});
export const SealIbeMultisigProof = new MoveStruct({
  name: `${$moduleName}::SealIbeMultisigProof`,
  fields: {
    id: object.UID,
    counter_id: bcs.Address,
    verified_signer_count: bcs.u64(),
  },
});
export const SealIbeAggregatedPk = new MoveStruct({
  name: `${$moduleName}::SealIbeAggregatedPk`,
  fields: {
    id: object.UID,
    /** Accumulated public key in G2 group (for internal operations) */
    public_key_g2: group_ops.Element,
    /** Accumulated public key in 96-byte format (for standard BLS verification) */
    public_key_bytes: bcs.vector(bcs.u8()),
    /** ID of the associated counter */
    counter_id: bcs.Address,
    /** Number of signers included in aggregation */
    signer_count: bcs.u64(),
    /** Signer IDs already included (for duplicate prevention) */
    included_signer_ids: bcs.vector(bcs.Address),
  },
});
export interface ShareArguments {
  signerIds: RawTransactionArgument<string[]>;
  signerPubkeys: RawTransactionArgument<number[][]>;
  threshold: RawTransactionArgument<number | bigint>;
}
export interface ShareOptions {
  package?: string;
  arguments:
    | ShareArguments
    | [
        signerIds: RawTransactionArgument<string[]>,
        signerPubkeys: RawTransactionArgument<number[][]>,
        threshold: RawTransactionArgument<number | bigint>,
      ];
}
/** Create and share SEAL IBE counter with embedded configuration */
export function share(options: ShareOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    "vector<0x0000000000000000000000000000000000000000000000000000000000000002::object::ID>",
    "vector<vector<u8>>",
    "u64",
  ] satisfies string[];
  const parameterNames = ["signerIds", "signerPubkeys", "threshold"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "share",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VerifyAndCreateProofArguments {
  counter: RawTransactionArgument<string>;
  aggregatedKey: RawTransactionArgument<string>;
  signatureG1Bytes: RawTransactionArgument<number[]>;
  message: RawTransactionArgument<number[]>;
}
export interface VerifyAndCreateProofOptions {
  package?: string;
  arguments:
    | VerifyAndCreateProofArguments
    | [
        counter: RawTransactionArgument<string>,
        aggregatedKey: RawTransactionArgument<string>,
        signatureG1Bytes: RawTransactionArgument<number[]>,
        message: RawTransactionArgument<number[]>,
      ];
}
/**
 * Verify aggregated signature and create one-time proof token This is the core
 * function that performs SEAL IBE multi-signature verification
 */
export function verifyAndCreateProof(options: VerifyAndCreateProofOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeAggregatedPk`,
    "vector<u8>",
    "vector<u8>",
  ] satisfies string[];
  const parameterNames = ["counter", "aggregatedKey", "signatureG1Bytes", "message"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "verify_and_create_proof",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IncrementArguments {
  counter: RawTransactionArgument<string>;
  proof: RawTransactionArgument<string>;
}
export interface IncrementOptions {
  package?: string;
  arguments:
    | IncrementArguments
    | [counter: RawTransactionArgument<string>, proof: RawTransactionArgument<string>];
}
/** Increment counter using proof token */
export function increment(options: IncrementOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigProof`,
  ] satisfies string[];
  const parameterNames = ["counter", "proof"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "increment",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewSealIbeAggregatedPkArguments {
  counter: RawTransactionArgument<string>;
}
export interface NewSealIbeAggregatedPkOptions {
  package?: string;
  arguments: NewSealIbeAggregatedPkArguments | [counter: RawTransactionArgument<string>];
}
/** Creates a new aggregated SEAL IBE key associated with a counter */
export function newSealIbeAggregatedPk(options: NewSealIbeAggregatedPkOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
  ] satisfies string[];
  const parameterNames = ["counter"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "new_seal_ibe_aggregated_pk",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AggregateSignerPubkeyArguments {
  counter: RawTransactionArgument<string>;
  aggregatedKey: RawTransactionArgument<string>;
  signerId: RawTransactionArgument<string>;
}
export interface AggregateSignerPubkeyOptions {
  package?: string;
  arguments:
    | AggregateSignerPubkeyArguments
    | [
        counter: RawTransactionArgument<string>,
        aggregatedKey: RawTransactionArgument<string>,
        signerId: RawTransactionArgument<string>,
      ];
}
/** Add a signer's public key to the aggregated key */
export function aggregateSignerPubkey(options: AggregateSignerPubkeyOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeAggregatedPk`,
    "0x0000000000000000000000000000000000000000000000000000000000000002::object::ID",
  ] satisfies string[];
  const parameterNames = ["counter", "aggregatedKey", "signerId"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "aggregate_signer_pubkey",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GetPackageIdBytesOptions {
  package?: string;
  arguments?: [];
}
/** Get current package ID dynamically using type reflection */
export function getPackageIdBytes(options: GetPackageIdBytesOptions = {}) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "get_package_id_bytes",
    });
}
export interface ValueArguments {
  self: RawTransactionArgument<string>;
}
export interface ValueOptions {
  package?: string;
  arguments: ValueArguments | [self: RawTransactionArgument<string>];
}
export function value(options: ValueOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "value",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ThresholdArguments {
  self: RawTransactionArgument<string>;
}
export interface ThresholdOptions {
  package?: string;
  arguments: ThresholdArguments | [self: RawTransactionArgument<string>];
}
export function threshold(options: ThresholdOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "threshold",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SignerCountArguments {
  self: RawTransactionArgument<string>;
}
export interface SignerCountOptions {
  package?: string;
  arguments: SignerCountArguments | [self: RawTransactionArgument<string>];
}
export function signerCount(options: SignerCountOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "signer_count",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SealIbeTableArguments {
  self: RawTransactionArgument<string>;
}
export interface SealIbeTableOptions {
  package?: string;
  arguments: SealIbeTableArguments | [self: RawTransactionArgument<string>];
}
export function sealIbeTable(options: SealIbeTableOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "seal_ibe_table",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PublicKeyG2Arguments {
  self: RawTransactionArgument<string>;
}
export interface PublicKeyG2Options {
  package?: string;
  arguments: PublicKeyG2Arguments | [self: RawTransactionArgument<string>];
}
/** Get the aggregated G2 public key */
export function publicKeyG2(options: PublicKeyG2Options) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeAggregatedPk`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "public_key_g2",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AggregatedKeyCounterIdArguments {
  self: RawTransactionArgument<string>;
}
export interface AggregatedKeyCounterIdOptions {
  package?: string;
  arguments: AggregatedKeyCounterIdArguments | [self: RawTransactionArgument<string>];
}
/** Get the counter ID associated with this aggregated key */
export function aggregatedKeyCounterId(options: AggregatedKeyCounterIdOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeAggregatedPk`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "aggregated_key_counter_id",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IncludedSignerIdsArguments {
  self: RawTransactionArgument<string>;
}
export interface IncludedSignerIdsOptions {
  package?: string;
  arguments: IncludedSignerIdsArguments | [self: RawTransactionArgument<string>];
}
/** Get the signer IDs included in the aggregation */
export function includedSignerIds(options: IncludedSignerIdsOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeAggregatedPk`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "included_signer_ids",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IncludedSignerCountArguments {
  self: RawTransactionArgument<string>;
}
export interface IncludedSignerCountOptions {
  package?: string;
  arguments: IncludedSignerCountArguments | [self: RawTransactionArgument<string>];
}
/** Get the count of signers included in the aggregation */
export function includedSignerCount(options: IncludedSignerCountOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeAggregatedPk`,
  ] satisfies string[];
  const parameterNames = ["self"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "included_signer_count",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DestroySealIbeAggregatedPkArguments {
  key: RawTransactionArgument<string>;
}
export interface DestroySealIbeAggregatedPkOptions {
  package?: string;
  arguments: DestroySealIbeAggregatedPkArguments | [key: RawTransactionArgument<string>];
}
/** Destroy SealIbeAggregatedPk object */
export function destroySealIbeAggregatedPk(options: DestroySealIbeAggregatedPkOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeAggregatedPk`,
  ] satisfies string[];
  const parameterNames = ["key"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "destroy_seal_ibe_aggregated_pk",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SealApproveArguments {
  id: RawTransactionArgument<number[]>;
  counter: RawTransactionArgument<string>;
  message: RawTransactionArgument<number[]>;
}
export interface SealApproveOptions {
  package?: string;
  arguments:
    | SealApproveArguments
    | [
        id: RawTransactionArgument<number[]>,
        counter: RawTransactionArgument<string>,
        message: RawTransactionArgument<number[]>,
      ];
}
/**
 * Seal approve function for SEAL IBE counter access InnerID structure: counter_id
 * || signer_address || H(domain || message)
 */
export function sealApprove(options: SealApproveOptions) {
  const packageAddress = options.package ?? "@local-pkg/counter";
  const argumentsTypes = [
    "vector<u8>",
    `${packageAddress}::seal_ibe_multisig_counter::SealIbeMultisigCounter`,
    "vector<u8>",
  ] satisfies string[];
  const parameterNames = ["id", "counter", "message"];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: "seal_ibe_multisig_counter",
      function: "seal_approve",
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
