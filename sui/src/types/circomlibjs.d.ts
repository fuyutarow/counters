declare module "circomlibjs" {
  export interface PoseidonHasher {
    (inputs: bigint[]): unknown;
    F: {
      toBigInt(value: unknown): bigint;
    };
  }

  export function buildPoseidon(): Promise<PoseidonHasher>;
}
