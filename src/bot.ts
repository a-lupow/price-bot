import { randomBytes } from "node:crypto"
import { asc, desc, eq } from "drizzle-orm"
import { Bot } from "grammy"

import { db } from "./db/index.js"
import {
  type NewScrapedListing,
  pendingPairings,
  type ScrapedListing,
  subscriptions,
  users,
} from "./db/schema.js"
import { env } from "./env.js"
import { logger } from "./log.js"
import { messageBus } from "./message-bus.js"
import { createSubscription } from "./sources/registry.js"

const bot = new Bot(env.TELEGRAM_TOKEN)
const botLogger = logger.child({ module: "bot" })

const OLX_HOSTS = new Set(["www.olx.pl", "olx.pl"])
const TELEGRAM_PARSE_MODE = "Markdown"

const escapeMarkdown = (value: string) => value.replace(/([_*`[\]])/g, "\\$1")

const formatPrice = (price: number | string, currency: string) =>
  escapeMarkdown(`${price} ${currency}`)

const formatAdMessage = (label: string, content: NewScrapedListing) => {
  return [
    `*${escapeMarkdown(label)}*`,
    "",
    `*Title:* ${escapeMarkdown(content.title)}`,
    `*Price:* ${formatPrice(content.price, content.currency)}`,
    `*URL:* ${content.url}`,
  ].join("\n")
}

const formatSubscriptionMessage = (subscription: { id: string; options: unknown }) => {
  const options =
    typeof subscription.options === "object" && subscription.options !== null
      ? Object.entries(subscription.options as Record<string, unknown>)
          .map(([key, value]) => `• *${escapeMarkdown(key)}:* ${escapeMarkdown(String(value))}`)
          .join("\n")
      : escapeMarkdown(String(subscription.options))

  return [`*Subscription #${escapeMarkdown(subscription.id)}*`, "", options].join("\n")
}

const formatListingMessage = (item: {
  title: string
  price: number | string
  currency: string
  url: string
}) => {
  return [
    `*Title:* ${escapeMarkdown(item.title)}`,
    `*Price:* ${formatPrice(item.price, item.currency)}`,
    `*URL:* ${item.url}`,
  ].join("\n")
}

const isOlxUrl = (value: string) => {
  try {
    const url = new URL(value)
    return OLX_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

const parseSubscribeInput = (message: string) => {
  return message.replace(/^\/subscribe(@\w+)?/i, "").trim()
}

const ensurePairedUser = async (chatId: string) => {
  return db.query.users.findFirst({
    where: eq(users.chatId, chatId),
  })
}

export function initialize() {
  messageBus.on("newAd", async (event) => {
    const pairedUsers = await db.query.users.findMany({
      orderBy: (user, { asc }) => [asc(user.createdAt)],
    })

    if (pairedUsers.length === 0) {
      return
    }

    await Promise.all(
      pairedUsers.map((user) =>
        bot.api.sendMessage(user.chatId, formatAdMessage("🚀 New ad", event.content), {
          parse_mode: TELEGRAM_PARSE_MODE,
        }),
      ),
    )
  })

  messageBus.on("newPrice", async (event) => {
    const pairedUsers = await db.query.users.findMany({
      orderBy: (user, { asc }) => [asc(user.createdAt)],
    })

    if (pairedUsers.length === 0) {
      return
    }

    await Promise.all(
      pairedUsers.map((user) =>
        bot.api.sendMessage(user.chatId, formatAdMessage("⏰️ Price drop", event.content), {
          parse_mode: TELEGRAM_PARSE_MODE,
        }),
      ),
    )
  })

  bot.command("start", async (ctx) => {
    const chatId = ctx.chatId.toString()
    const existing = await db.query.users.findFirst({
      where: eq(users.chatId, chatId),
    })

    if (existing) {
      await ctx.reply("You are already paired.")
      return
    }

    const pairingCode = randomBytes(4).toString("hex").toUpperCase()

    await db
      .insert(pendingPairings)
      .values({
        pairingCode,
        chatId,
      })
      .onConflictDoUpdate({
        target: pendingPairings.chatId,
        set: {
          pairingCode,
        },
      })

    botLogger.warn({ pairingCode, chatId }, "New user detected")

    await ctx.reply("Please enter your pairing code.")
  })

  bot.command("list", async (ctx) => {
    const items = await db.query.scrapedListings.findMany({
      limit: 10,
      orderBy: (listing) => [desc(listing.scrapedAt), asc(listing.price)],
    })

    if (items.length === 0) {
      await ctx.reply("No scraped listings are available yet.")
      return
    }

    for (const item of items) {
      await ctx.reply(formatListingMessage(item), {
        parse_mode: TELEGRAM_PARSE_MODE,
      })
    }
  })

  bot.command("subscribe", async (ctx) => {
    const chatId = ctx.chatId.toString()
    const pairedUser = await ensurePairedUser(chatId)

    if (!pairedUser) {
      await ctx.reply("You need to pair first. Use /start and then send your pairing code.")
      return
    }

    const message = ctx.message?.text
    if (!message) {
      await ctx.reply("Please provide a search query or an OLX URL.")
      return
    }

    const input = parseSubscribeInput(message)

    if (!input) {
      await ctx.reply("Please provide a search query or an OLX URL.")
      return
    }

    try {
      if (input.startsWith("http://") || input.startsWith("https://")) {
        if (!isOlxUrl(input)) {
          await ctx.reply("Currently only olx.pl URLs are supported.")
          return
        }

        await db.insert(subscriptions).values(
          createSubscription("olx", {
            url: input,
          }),
        )

        await ctx.reply(
          [
            "*✅ Global subscription created*",
            "",
            "*Source:* OLX URL",
            `*Value:* ${escapeMarkdown(input)}`,
          ].join("\n"),
          {
            parse_mode: TELEGRAM_PARSE_MODE,
          },
        )
        return
      }

      await db.insert(subscriptions).values(
        createSubscription("olx", {
          searchQuery: input,
        }),
      )

      await ctx.reply(
        [
          "*✅ Global subscription created*",
          "",
          "*Source:* Search query",
          `*Value:* ${escapeMarkdown(input)}`,
        ].join("\n"),
        {
          parse_mode: TELEGRAM_PARSE_MODE,
        },
      )
    } catch (error) {
      botLogger.error({ error, input, chatId }, "Failed to create subscription")
      await ctx.reply("Could not create the subscription. Please verify the input and try again.")
    }
  })

  bot.command("subscriptions", async (ctx) => {
    const pairedUser = await ensurePairedUser(ctx.chatId.toString())

    if (!pairedUser) {
      await ctx.reply("You need to pair first. Use /start and then send your pairing code.")
      return
    }

    const items = await db.query.subscriptions.findMany({
      limit: 20,
      orderBy: (subscription, { desc }) => [desc(subscription.createdAt)],
    })

    if (items.length === 0) {
      await ctx.reply("No global subscriptions have been created yet.")
      return
    }

    for (const subscription of items) {
      await ctx.reply(formatSubscriptionMessage(subscription), {
        parse_mode: TELEGRAM_PARSE_MODE,
      })
    }
  })

  bot.on("message:text", async (ctx) => {
    const message = ctx.message.text.trim()

    if (!message || message.startsWith("/")) {
      return
    }

    const chatId = ctx.chatId.toString()
    const pairing = await db.query.pendingPairings.findFirst({
      where: eq(pendingPairings.chatId, chatId),
    })

    if (!pairing) {
      return
    }

    if (message !== pairing.pairingCode) {
      await ctx.reply("Invalid pairing code. Please try again.")
      return
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({
          chatId,
        })
        .onConflictDoNothing()

      await tx.delete(pendingPairings).where(eq(pendingPairings.chatId, chatId))
    })

    await ctx.reply(
      [
        "*✅ Pairing successful*",
        "",
        "You will now receive notifications about:",
        "• *new ads*",
        "• *price drops*",
      ].join("\n"),
      {
        parse_mode: TELEGRAM_PARSE_MODE,
      },
    )
  })

  bot.start()
  logger.info("Bot initialized and started.")
}
