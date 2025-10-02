declare module "circomlibjs" {
  export interface PoseidonField {
    toString(value: Uint8Array): string;
    toObject(value: Uint8Array): unknown;
    // ... other field methods
  }

  export interface PoseidonHasher {
    (inputs: bigint[]): Uint8Array;
    F: PoseidonField;
  }

  export function buildPoseidon(): Promise<PoseidonHasher>;
}
