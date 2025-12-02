import { z } from "zod";

const serverEnvSchema = z.object({
  ENOKI_SECRET_KEY: z.string().min(1).optional(),
});

export const serverEnv = serverEnvSchema.parse({
  ENOKI_SECRET_KEY: process.env.ENOKI_SECRET_KEY,
});
