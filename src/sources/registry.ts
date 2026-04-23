import type { NewSubscription, Subscription } from "../db/schema.js"
import type { SubscriptionRequests } from "./index.js"
import { OlxSource } from "./olx.js"

export const sources = {
  olx: new OlxSource(),
}

export type SourceRegistry = typeof sources
export type Source = keyof SourceRegistry

/**
 * A utility function that retrieves the source instance based on the provided source type.
 *
 * @param type
 *   The type of the source to retrieve, which must be a key of the SourceRegistry.
 *
 * @throws
 *  `Error` If the provided source type is not supported.
 * @returns
 */
export function getSource<TSource extends Source>(type: TSource): SourceRegistry[TSource] {
  const source = sources[type]

  if (!source) {
    throw new Error(`Unsupported source type: ${type}`)
  }

  return source
}

/**
 * Creates a new subscription object based on the provided source and options.
 * It validates the options against the corresponding schema for the source before returning the subscription object.
 *
 * @param source
 * @param options
 * @returns
 */
export function createSubscription<TSource extends Source, TOptions>(
  source: TSource,
  options: TOptions,
): NewSubscription {
  const parsed = getSource(source).validateOptions(options)

  return {
    source,
    options: parsed,
  }
}

/**
 * A utility function that takes an array of subscriptions and builds the corresponding requests for each subscription.
 *
 * @param subscriptions
 * @returns
 */
export async function buildSubscriptionRequests(
  subscriptions: Subscription[],
): Promise<SubscriptionRequests> {
  const requests = await Promise.all(
    subscriptions.map((subscription) => getSource(subscription.source).buildRequests(subscription)),
  )

  return requests.flat()
}
