import type { createPlaywrightRouter } from "crawlee"
import z from "zod"

import type { Subscription } from "../db/schema.js"
import { processInput } from "../item-processor.js"
import { evaluateTitleMatch, getQueryContext } from "../utils.js"
import type { SubscriptionRequests } from "./index.js"
import { createAbstractSource } from "./index.js"

export const OlxSubscriptionOptionsSchema = z.union([
  z.object({
    url: z.url(),
  }),
  z.object({
    searchQuery: z.string().trim().min(1),
  }),
])

export type OlxSubscriptionOptions = z.infer<typeof OlxSubscriptionOptionsSchema>

const OLX_HOSTS = new Set(["www.olx.pl", "olx.pl"])

const buildSearchUrl = (searchQuery: string) => {
  const normalizedQuery = searchQuery.trim().replace(/\s+/g, " ")
  const encodedQuery = encodeURIComponent(normalizedQuery)
  return `https://www.olx.pl/oferty/q-${encodedQuery}/`
}

const isOlxUrl = (value: string) => {
  try {
    const url = new URL(value)
    return OLX_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

const extractSearchTermFromPage = async (page: {
  $eval: <T>(selector: string, pageFunction: (element: Element) => T) => Promise<T>
}) => {
  try {
    const value = await page.$eval("[data-testid='search-input']", (element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value.trim()
      }

      return ""
    })

    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

const resolveEffectiveSearchTerm = async (
  page: {
    $eval: <T>(selector: string, pageFunction: (element: Element) => T) => Promise<T>
  },
  searchTerm: unknown,
) => {
  if (typeof searchTerm === "string" && searchTerm.trim().length > 0) {
    return searchTerm.trim()
  }

  return extractSearchTermFromPage(page)
}

/**
 * Implements an olx.pl source.
 */
export class OlxSource extends createAbstractSource(OlxSubscriptionOptionsSchema) {
  override async buildRequests(subscription: Subscription): Promise<SubscriptionRequests> {
    const options = this.validateOptions(subscription.options)

    if ("url" in options) {
      if (!isOlxUrl(options.url)) {
        throw new Error(`Subscription ${subscription.id} contains a non-OLX URL`)
      }

      return [
        this.createRequest(subscription, options.url, {
          searchTerm: null,
        }),
      ]
    }

    const searchTerm = options.searchQuery.trim()

    return [
      this.createRequest(subscription, buildSearchUrl(searchTerm), {
        searchTerm,
      }),
    ]
  }

  override registerRoute(router: ReturnType<typeof createPlaywrightRouter>): void {
    router.addHandler("olx", async ({ request, enqueueLinks, log, page }) => {
      log.info("Collecting information from the page")

      const { subscriptionId } = request.userData

      if (typeof subscriptionId !== "string" || subscriptionId.length === 0) {
        log.error("Subscription id is missing in request userData, skipping", {
          userData: request.userData,
        })
        return
      }

      await page.waitForLoadState("domcontentloaded")

      const effectiveSearchTerm = await resolveEffectiveSearchTerm(
        page,
        request.userData.searchTerm,
      )
      const queryContext = getQueryContext({
        url: request.url,
        loadedUrl: request.loadedUrl,
        userData: {
          ...request.userData,
          searchTerm: effectiveSearchTerm ?? request.userData.searchTerm,
        },
      })

      const items = await page.$$("[data-testid='l-card']")

      for (const item of items) {
        const title = await item.$eval(
          "[data-testid='ad-card-title'] a",
          (element) => element.textContent?.trim() ?? null,
        )
        const url = await item.$eval("a", (element) => element.href)
        const priceRawContainer = await item.$("[data-testid='ad-price']")

        if (!title) {
          log.warning("Title not found for an item, skipping")
          continue
        }

        if (!priceRawContainer) {
          log.warning("Price container not found for item", { title })
          continue
        }

        const priceRaw = await priceRawContainer.evaluate((element) => {
          for (const child of element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              return child.textContent?.trim() || null
            }
          }

          return null
        })

        const canNegociateContainer = await priceRawContainer.$("[data-nx-name=Label2]:not(:empty)")
        const canNegociate = !!canNegociateContainer

        const priceMatch = priceRaw?.match(/([\d\s]+)\s*([^\d\s]+)/)
        if (!priceMatch) {
          log.warning("Price format is unexpected, skipping item", { title, priceRaw })
          continue
        }

        const price = Number.parseInt(priceMatch[1].replace(/\s/g, ""), 10)
        const currency = priceMatch[2]

        if (Number.isNaN(price)) {
          log.warning("Price could not be parsed, skipping item", { title, priceRaw })
          continue
        }

        if (typeof effectiveSearchTerm === "string" && effectiveSearchTerm.length > 0) {
          const titleMatch = evaluateTitleMatch(title, effectiveSearchTerm)

          if (!titleMatch.accepted) {
            log.warning("Title is not a strong enough match for search term, skipping item", {
              title,
              searchTerm: effectiveSearchTerm,
              reason: titleMatch.reason,
              score: titleMatch.score,
              matches: titleMatch.matches,
            })
            continue
          }
        }

        await processInput({
          subscriptionId,
          queryUrl: queryContext.queryUrl,
          normalizedQuery: queryContext.normalizedQuery,
          title,
          price,
          currency,
          url,
          meta: {
            canNegociate,
            source: "olx",
            searchTerm: effectiveSearchTerm,
            scrapedFromUrl: request.loadedUrl ?? request.url,
          },
        })
      }

      await enqueueLinks({
        selector: "a[data-testid=pagination-forward]",
        userData: {
          ...request.userData,
          searchTerm: effectiveSearchTerm,
        },
        label: "olx",
      })
    })
  }
}
