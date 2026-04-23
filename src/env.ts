import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.url().min(1, "DATABASE_URL is required"),
  TELEGRAM_TOKEN: z.string().min(45, "Telegram token is required"),
})

export type Env = z.output<typeof envSchema>
export const env = envSchema.parse(process.env)
