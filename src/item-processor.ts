import { and, eq } from "drizzle-orm"

import { db } from "./db/index.js"
import { type NewScrapedListing, scrapedListings } from "./db/schema.js"
import { messageBus } from "./message-bus.js"

export async function processInput(input: NewScrapedListing) {
  const existing = await db.query.scrapedListings.findFirst({
    where: and(
      eq(scrapedListings.subscriptionId, input.subscriptionId),
      eq(scrapedListings.normalizedQuery, input.normalizedQuery),
      eq(scrapedListings.url, input.url),
    ),
  })

  await db
    .insert(scrapedListings)
    .values(input)
    .onConflictDoUpdate({
      target: [
        scrapedListings.subscriptionId,
        scrapedListings.normalizedQuery,
        scrapedListings.url,
      ],
      set: {
        queryUrl: input.queryUrl,
        title: input.title,
        price: input.price,
        currency: input.currency,
        meta: input.meta ?? {},
        scrapedAt: new Date(),
      },
    })

  if (!existing) {
    messageBus.emit("newAd", {
      content: input,
    })
    return
  }

  if (existing.price !== input.price || existing.currency !== input.currency) {
    messageBus.emit("newPrice", {
      content: input,
    })
  }
}
