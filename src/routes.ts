import { createPlaywrightRouter } from "crawlee"
import { logger } from "./log.js"
import { sources } from "./sources/registry.js"

export const router = createPlaywrightRouter()

// Register handlers.
for (const source in sources) {
  logger.info(`Registering route for source: ${source}`)
  sources[source as keyof typeof sources].registerRoute(router)
}
