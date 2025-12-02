import { z } from "zod";

const serverEnvSchema = z.object({
  // Enoki API key for Enoki-based sponsorship
  ENOKI_SECRET_KEY: z.string().min(1).optional(),
  // Private key for self-sponsorship (backend pays gas directly)
  // Format: base64 or hex encoded Ed25519 private key
  SPONSOR_PRIVATE_KEY: z.string().min(1).optional(),
});

export const serverEnv = serverEnvSchema.parse({
  ENOKI_SECRET_KEY: process.env.ENOKI_SECRET_KEY,
  SPONSOR_PRIVATE_KEY: process.env.SPONSOR_PRIVATE_KEY,
});
