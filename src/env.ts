import { z } from "zod"

const parseChromiumFlags = (value: string | undefined) => {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean)
}

const envSchema = z.object({
  DATABASE_URL: z.url().min(1, "DATABASE_URL is required"),
  TELEGRAM_TOKEN: z.string().min(45, "Telegram token is required"),
  CHROMIUM_EXECUTABLE_PATH: z.string().trim().min(1).optional(),
  CHROMIUM_LAUNCH_FLAGS: z
    .string()
    .optional()
    .transform((value) => parseChromiumFlags(value)),
})

export type Env = z.output<typeof envSchema>
export const env = envSchema.parse(process.env)
