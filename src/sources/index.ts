import type { RequestOptions } from "crawlee"
import type { infer as ZodInfer, ZodType } from "zod"

import type { Subscription } from "../db/schema.js"

export type SubscriptionRequest = RequestOptions
export type SubscriptionRequests = SubscriptionRequest[]

export interface ScrapingSource<TOptions = unknown> {
  /**
   * Validates input options against the expected structure for the source and returns the parsed options.
   *
   * @param options
   *   The input options to validate and parse.
   */
  validateOptions(options: unknown): TOptions

  /**
   * Registers the necessary routes and handlers for the source on the provided router.
   *
   * @param router
   *   The router instance on which to register the routes for this source.
   */
  registerRoute(router: unknown): void

  /**
   * Builds the requests to be made for a given subscription based on its options.
   *
   * @param subscription
   *   The subscription for which to build the requests.
   */
  buildRequests(subscription: Subscription): Promise<SubscriptionRequests>
}

/**
 * Infers the option structure for a given scraping source.
 */
export type InferScrapingSourceOptions<TSource extends ScrapingSource> =
  TSource extends ScrapingSource<infer TOptions> ? TOptions : never

export const isScrapingSource = (obj: unknown): obj is ScrapingSource<unknown> => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as ScrapingSource).registerRoute === "function" &&
    typeof (obj as ScrapingSource).validateOptions === "function" &&
    typeof (obj as ScrapingSource).buildRequests === "function"
  )
}

export const isScrappingSource = isScrapingSource

/**
 * A helper function that creates an abstract class for a scraping source based on the provided Zod schema.
 *
 * @param schema
 *   A schema that defines the expected structure of the options for the scraping source.
 */
export const createAbstractSource = <TSchema extends ZodType>(schema: TSchema) => {
  abstract class AbstractSource implements ScrapingSource<ZodInfer<TSchema>> {
    /**
     * @inheritdoc
     */
    validateOptions(options: unknown): ZodInfer<TSchema> {
      return schema.parse(options)
    }

    /**
     * @inheritdoc
     */
    createRequest(
      subscription: Subscription,
      url: string,
      userData: Record<string, unknown> = {},
    ): SubscriptionRequest {
      return {
        url,
        label: subscription.source,
        userData: {
          subscriptionId: subscription.id,
          source: subscription.source,
          ...userData,
        },
      }
    }

    abstract registerRoute(router: unknown): void
    abstract buildRequests(subscription: Subscription): Promise<SubscriptionRequests>
  }

  return AbstractSource
}
