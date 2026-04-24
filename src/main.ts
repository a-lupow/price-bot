import { Log, PlaywrightCrawler } from "crawlee"
import { CronJob } from "cron"
import { chromium } from "playwright-extra"
import stealth from "puppeteer-extra-plugin-stealth"
import "dotenv/config"

import { initialize } from "./bot.js"
import { db } from "./db/index.js"
import { env } from "./env.js"
import { logger, PinoCrawleeAdapter } from "./log.js"
import { router } from "./routes.js"
import { buildSubscriptionRequests } from "./sources/registry.js"

chromium.use(stealth())

const crawlerLogger = logger.child({ module: "crawler" })

const crawler = new PlaywrightCrawler({
  requestHandler: router,
  maxRequestsPerCrawl: 50,
  launchContext: {
    launcher: chromium,
    launchOptions: {
      headless: true,
      executablePath: env.CHROMIUM_EXECUTABLE_PATH,
      args: env.CHROMIUM_LAUNCH_FLAGS,
    },
  },
  log: new Log({
    logger: new PinoCrawleeAdapter({
      pino: crawlerLogger.child({ component: "crawlee" }),
    }),
  }),
})

const runSubscriptionsCrawl = async () => {
  const subscriptions = await db.query.subscriptions.findMany({
    limit: 100,
    orderBy: (subscription, { desc }) => [desc(subscription.createdAt)],
  })

  if (subscriptions.length === 0) {
    crawlerLogger.info("No subscriptions found, skipping crawl run")
    return
  }

  const startUrls = await buildSubscriptionRequests(subscriptions)

  if (startUrls.length === 0) {
    crawlerLogger.warn(
      { subscriptionCount: subscriptions.length },
      "No crawl requests were built from subscriptions",
    )
    return
  }

  crawlerLogger.info(
    {
      subscriptionCount: subscriptions.length,
      requestCount: startUrls.length,
      executablePath: env.CHROMIUM_EXECUTABLE_PATH ?? null,
      launchFlags: env.CHROMIUM_LAUNCH_FLAGS,
    },
    "Starting scheduled crawl run",
  )

  await crawler.run(startUrls)

  crawlerLogger.info(
    {
      subscriptionCount: subscriptions.length,
      requestCount: startUrls.length,
    },
    "Scheduled crawl run finished",
  )
}

CronJob.from({
  cronTime: "*/5 * * * *",
  onTick: async () => {
    try {
      await runSubscriptionsCrawl()
    } catch (error) {
      crawlerLogger.error({ error }, "Scheduled crawl run failed")
    }
  },
  start: true,
})

logger.info(
  {
    chromiumExecutablePath: env.CHROMIUM_EXECUTABLE_PATH ?? null,
    chromiumLaunchFlags: env.CHROMIUM_LAUNCH_FLAGS,
  },
  "Crawler initialized",
)

initialize()
