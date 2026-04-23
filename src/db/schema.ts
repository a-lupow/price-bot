import { relations } from "drizzle-orm"
import {
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

export const sourcesEnum = pgEnum("source", ["olx"])

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),

  source: sourcesEnum("source").notNull().default("olx"),
  options: json("options"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert

export const scrapedListings = pgTable(
  "scraped_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),

    queryUrl: text("query_url"),
    normalizedQuery: text("normalized_query").notNull(),
    title: text("title").notNull(),
    price: integer("price").notNull(),
    currency: varchar("currency", { length: 16 }).notNull(),
    url: text("url").notNull(),
    meta: json("meta").notNull().default({}),

    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("scraped_listings_price_idx").on(table.price),
    index("scraped_listings_scraped_at_idx").on(table.scrapedAt),
    index("scraped_listings_url_idx").on(table.url),
    index("scraped_listings_normalized_query_idx").on(table.normalizedQuery),
    uniqueIndex("scraped_listings_subscription_query_url_uidx").on(
      table.subscriptionId,
      table.normalizedQuery,
      table.url,
    ),
  ],
)

export type ScrapedListing = typeof scrapedListings.$inferSelect
export type NewScrapedListing = typeof scrapedListings.$inferInsert

export const users = pgTable(
  "user",
  {
    chatId: varchar("chat_id", { length: 16 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("user_chat_id_idx").on(table.chatId)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export const pendingPairings = pgTable(
  "pending_pairings",
  {
    pairingCode: varchar("pairing_code", { length: 16 }).notNull(),
    chatId: varchar("chat_id", { length: 16 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pending_pairings_pairing_code_idx").on(table.pairingCode),
    index("pending_pairings_chat_id_idx").on(table.chatId),
  ],
)

export type PendingPairing = typeof pendingPairings.$inferSelect
export type NewPendingPairing = typeof pendingPairings.$inferInsert

export const subscriptionRelations = relations(subscriptions, ({ many }) => {
  return {
    scrapedListings: many(scrapedListings),
  }
})

export const scrapedListingRelations = relations(scrapedListings, ({ one }) => {
  return {
    subscription: one(subscriptions, {
      fields: [scrapedListings.subscriptionId],
      references: [subscriptions.id],
    }),
  }
})
