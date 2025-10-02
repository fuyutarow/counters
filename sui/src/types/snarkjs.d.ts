declare module "snarkjs" {
  export namespace groth16 {
    export function fullProve(
      input: Record<string, string>,
      wasmFile: Uint8Array,
      zkeyFile: Uint8Array,
    ): Promise<{
      proof: {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;
  }
}
