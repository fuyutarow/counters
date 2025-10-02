# Private Counter ZK Circuit

Circom implementation of a privacy-preserving counter with +1 increment enforcement using Groth16 proofs.

## Overview

This circuit proves knowledge of a private counter increment without revealing the actual counter value. It enforces that only +1 increments are allowed.

### Circuit Constraints

1. **Salt Verification**: `Poseidon(salt) == salt_hash`
2. **Old Hash Verification**: `Poseidon(old_value, old_randomness) == old_hash`
3. **+1 Increment**: `new_value == old_value + 1`
4. **New Hash Generation**: `Poseidon(new_value, new_randomness) == new_hash`
5. **Range Constraint**: `old_value < 2^64`

## Quick Start

### 1. Setup Environment

```bash
cd /home/fuyu/OPENJPY/c2/sui
mise run circom:install
```

This will:
- Install Circom compiler
- Install snarkjs
- Clone circomlib (for Poseidon hash)

### 2. Complete ZK Workflow

```bash
mise run circom:test
```

This runs the full workflow:
1. Compile circuit → R1CS + WASM
2. Download Powers of Tau
3. Generate proving/verification keys
4. Generate witness + proof
5. Verify proof

### 3. Individual Steps

```bash
# Compile circuit
mise run circom:build private_counter

# Setup trusted setup
mise run circom:setup private_counter

# Generate proof
mise run circom:prove private_counter input.json

# Verify proof
mise run circom:verify private_counter

# Clean artifacts
mise run circom:clean
```

## File Structure

```
circuits/
├── private_counter.circom    # Main circuit
├── input.json                # Test input (will be updated with real hashes)
├── circomlib/                # Cloned from iden3/circomlib
├── build/                    # Compiled artifacts
│   ├── private_counter.r1cs
│   ├── private_counter_js/
│   │   ├── private_counter.wasm
│   │   └── generate_witness.js
│   └── private_counter.sym
├── keys/                     # Trusted setup keys
│   ├── powersOfTau28_hez_final_14.ptau
│   ├── private_counter_final.zkey
│   └── private_counter_vk.json
└── proofs/                   # Generated proofs
    ├── witness.wtns
    ├── proof.json
    └── public.json
```

## Integration with Sui

### Computing Poseidon Hashes

Before generating a proof, you need to compute the correct hash values using Poseidon:

```typescript
// Example: Computing hashes in TypeScript
import { poseidon } from "circomlibjs";

const salt = 42n;
const oldValue = 0n;
const oldRandomness = 123456789n;
const newRandomness = 987654321n;

// Compute salt_hash
const saltHash = poseidon([salt]);

// Compute old_hash
const oldHash = poseidon([oldValue, oldRandomness]);

// Compute new_hash (old_value + 1)
const newHash = poseidon([oldValue + 1n, newRandomness]);

// Update input.json with these values
const input = {
  salt: salt.toString(),
  old_value: oldValue.toString(),
  old_randomness: oldRandomness.toString(),
  new_randomness: newRandomness.toString(),
  salt_hash: saltHash.toString(),
  old_hash: oldHash.toString(),
  new_hash: newHash.toString()
};
```

### Passing Proof to Sui

The generated proof needs to be formatted for Sui's `increment()` function:

```typescript
import { readFileSync } from 'fs';

// Read generated proof and public inputs
const proof = JSON.parse(readFileSync('proofs/proof.json', 'utf8'));
const publicSignals = JSON.parse(readFileSync('proofs/public.json', 'utf8'));

// Sui expects:
// 1. proof_bytes: Groth16 proof (serialized)
// 2. public_inputs_bytes: salt_hash || old_hash || new_hash (BCS format)
// 3. verifying_key_bytes: VK from keys/private_counter_vk.json

// Call Sui contract
await tx.moveCall({
  target: `${packageId}::private_counter::increment`,
  arguments: [
    tx.object(counterObjectId),
    tx.pure(proofBytes),
    tx.pure(publicInputsBytes),
    tx.pure(verifyingKeyBytes),
  ],
});
```

## Verification Key Hash

For Sui's tamper detection, compute the VK hash:

```bash
# Extract VK bytes
cat keys/private_counter_vk.json | jq -r '.vk_alpha_1'

# In Sui contract initialization:
# vk_hash = Blake2b256(verifying_key_bytes)
```

## Testing

### Local Testing (snarkjs)

```bash
# Run complete test workflow
mise run circom:test
```

### On-Chain Testing (Sui)

```bash
# Deploy private_counter Move module
cd move/counter
sui move build
sui client publish --gas-budget 100000000

# Generate proof with correct inputs
# ... (compute hashes, generate proof)

# Submit proof to Sui
# ... (call increment function)
```

## Poseidon Compatibility

This circuit uses `circomlib/circuits/poseidon.circom`, which should match Sui's `poseidon::poseidon_bn254()`.

**Verification Required:**
- Both use BN254 curve ✅
- Both use same Poseidon parameters (needs verification)
- Field element encoding matches

## Troubleshooting

### "circom: command not found"

```bash
mise run circom:install
# or manually:
cargo install circom
```

### "snarkjs: command not found"

```bash
npm install -g snarkjs
```

### Proof verification fails

- Check that input.json has correct Poseidon hash values
- Ensure public inputs match (salt_hash, old_hash, new_hash)
- Verify range constraint: old_value < 2^64

### Circomlib not found

```bash
cd move/circuits
git clone https://github.com/iden3/circomlib.git
```

## References

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs](https://github.com/iden3/snarkjs)
- [circomlib](https://github.com/iden3/circomlib)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Sui Groth16 Module](https://docs.sui.io/guides/developer/cryptography/groth16)
