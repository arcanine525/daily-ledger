import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:/.test(value)),
  DIRECT_URL: z.url().refine((value) => /^postgres(ql)?:/.test(value)),
  APP_ORIGIN: z.url().transform((value) => new URL(value).origin),
  PROVIDER_ENCRYPTION_KEY: z.string().refine((value) => {
    const bytes = Buffer.from(value, "base64");
    return bytes.length === 32 && bytes.toString("base64") === value;
  }),
  PROVIDER_ENCRYPTION_KEY_ID: z.string().min(1),
});

export class ConfigurationError extends Error {
  constructor() {
    super("Invalid server configuration");
    this.name = "ConfigurationError";
  }
}

export function parseEnvironment(input: unknown) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) throw new ConfigurationError();
  return result.data;
}
