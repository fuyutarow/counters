import { z } from "zod";

const serverEnvSchema = z.object({
  // Private key for fee payer sponsorship (backend pays transaction fees)
  // Format: base58 encoded Solana private key
  SPONSOR_PRIVATE_KEY: z.string().min(1).optional(),
});

export const serverEnv = serverEnvSchema.parse({
  SPONSOR_PRIVATE_KEY: process.env.SPONSOR_PRIVATE_KEY,
});
