import { Logger, LogLevel } from 'crawlee'
import { pino } from 'pino'

export const logger = pino({
  transport: {
    target: 'pino-pretty'
  }
})

export type PinoCrawledAdapterOptions = {
  pino: ReturnType<typeof pino>,
}

export class PinoCrawleeAdapter extends Logger {
  // biome-ignore lint/complexity/noUselessConstructor: Type safety.
  constructor(
    options: PinoCrawledAdapterOptions,
  ) {
    super(options)
  }

  // biome-ignore lint/suspicious/noExplicitAny: Expected by the base class.
  override _log(level: LogLevel, message: string, data?: any, exception?: unknown, _opts?: Record<string, any>): void {
    const pino = (this.options as PinoCrawledAdapterOptions).pino

    switch (level) {
      case LogLevel.DEBUG:
        pino.debug(data, message)
        break

      case LogLevel.INFO:
        pino.info(data, message)
        break

      case LogLevel.WARNING:
        pino.warn(data, message)
        break

      case LogLevel.ERROR:
        pino.error(data, message)
        break

      default:
        pino.info(data, message)
        break
    }

    // Display exception if necessary.
    if (exception) {
      pino.error(exception)
    }
  }
}
