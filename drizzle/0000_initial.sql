CREATE TYPE "public"."source" AS ENUM('olx');--> statement-breakpoint
CREATE TABLE "pending_pairings" (
	"pairing_code" varchar(16) NOT NULL,
	"chat_id" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_pairings_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "scraped_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"query_url" text,
	"normalized_query" text NOT NULL,
	"title" text NOT NULL,
	"price" integer NOT NULL,
	"currency" varchar(16) NOT NULL,
	"url" text NOT NULL,
	"meta" json DEFAULT '{}'::json NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source" DEFAULT 'olx' NOT NULL,
	"options" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"chat_id" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
ALTER TABLE "scraped_listings" ADD CONSTRAINT "scraped_listings_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_pairings_pairing_code_idx" ON "pending_pairings" USING btree ("pairing_code");--> statement-breakpoint
CREATE INDEX "pending_pairings_chat_id_idx" ON "pending_pairings" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "scraped_listings_price_idx" ON "scraped_listings" USING btree ("price");--> statement-breakpoint
CREATE INDEX "scraped_listings_scraped_at_idx" ON "scraped_listings" USING btree ("scraped_at");--> statement-breakpoint
CREATE INDEX "scraped_listings_url_idx" ON "scraped_listings" USING btree ("url");--> statement-breakpoint
CREATE INDEX "scraped_listings_normalized_query_idx" ON "scraped_listings" USING btree ("normalized_query");--> statement-breakpoint
CREATE UNIQUE INDEX "scraped_listings_subscription_query_url_uidx" ON "scraped_listings" USING btree ("subscription_id","normalized_query","url");--> statement-breakpoint
CREATE INDEX "user_chat_id_idx" ON "user" USING btree ("chat_id");