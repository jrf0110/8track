import { Middleware } from '../Router'
import { KVNamespace } from '@cloudflare/workers-types'

interface KVStaticOptions {
  kv: KVNamespace
  maxAge?: number
}

/**
 * Streams files out of KV if it exists
 * @param options
 */
export function kvStatic(options: KVStaticOptions): Middleware {
  return async (ctx, next) => {
    // TODO: Store mime types in KV as well
    const contentTypes = {
      css: 'text/css',
      js: 'application/javascript',
      html: 'text/html',
      png: 'image/png',
      svg: 'image/svg+xml',
      gif: 'image/gif',
      jpg: 'image/jpg',
      jpeg: 'image/jpg',
    } as const
    const supportedExtensions = Object.keys(contentTypes)

    if (!supportedExtensions.some(ext => ctx.request.url.endsWith('.' + ext))) {
      return next()
    }

    const filename = ctx.request.url.substring(ctx.request.url.lastIndexOf('/') + 1)
    const ext = filename.substring(filename.lastIndexOf('.') + 1)
    const contentType = contentTypes[ext as keyof typeof contentTypes] || 'text'
    const body = await options.kv.get(filename, 'stream')

    if (!body) return ctx.end('', { status: 404 })

    return ctx.end(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': options.maxAge ? `max-age=${options.maxAge}` : 'public',
      },
    })
  }
}
