import { Middleware } from '../Router'
import { KVNamespace } from '@cloudflare/workers-types'
const cache = { put: (path: string, num: number) => {} }

type CacheOptions = {
  browserTTL: number
  edgeTTL: number
  bypassCache: boolean
}
type SiteInit = {
  /* handle requests that don't exist on the bucket */
  notFoundHandler: (req: Request) => Response | Promise<Response>
  /* configure how the incoming request's path is found in the bucket */
  pathToKeyModifier: (path: string) => string
  /* control the cache for all the site's content or on per request bias */
  cacheControl: CacheOptions | ((req: Request) => CacheOptions)
}
const defaultSiteInit: SiteInit = {
  notFoundHandler: () => new Response('Not Found', { status: 404 }),
  pathToKeyModifier: (path: string) => path,
  cacheControl: {
    browserTTL: 720,
    edgeTTL: 720,
    bypassCache: false,
  },
}
/**
 * Streams files out of KV if it exists
 * TODO KVNamespace should come from the wrangler config .. ?
 */
export function kvStatic(kv: KVNamespace, mOptions: Partial<SiteInit>): Middleware {
  return async (ctx, next) => {
    // TODO: Store mime types in KV as well
    const contentTypes = {
      css: 'text/css',
      js: 'application/javascript',
      map: 'application/json',
      json: 'application/json',
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
    // set up options from mOptions passed in and the default options
    const options = Object.assign({}, defaultSiteInit, mOptions)
    // set cache options by either evaluating the handler passed in
    // or whatever settings were passed in
    let evalCacheOpts: CacheOptions = (function() {
      switch (typeof mOptions.cacheControl) {
        case 'function':
          return mOptions.cacheControl(ctx.request)
        case 'object':
          return mOptions.cacheControl
        case 'undefined': //just returns default cache settings, but type safe
          return typeof defaultSiteInit.cacheControl === 'function'
            ? defaultSiteInit.cacheControl(ctx.request)
            : defaultSiteInit.cacheControl
      }
    })()
    const cacheOpts: CacheOptions = Object.assign({}, defaultSiteInit.cacheControl, evalCacheOpts)

    // TODO first try to match request will cache
    // TODO eval path handler
    const filename = ctx.request.url.substring(ctx.request.url.lastIndexOf('/') + 1)
    const ext = filename.substring(filename.lastIndexOf('.') + 1)
    const contentType = contentTypes[ext as keyof typeof contentTypes] || 'text'
    const body = await kv.get(filename, 'stream')

    if (cacheOpts.edgeTTL && !cacheOpts.bypassCache) cache.put(filename, cacheOpts.edgeTTL)

    if (!body) return ctx.end(await options.notFoundHandler(ctx.request))

    return ctx.end(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `max-age=${cacheOpts.browserTTL}`,
      },
    })
  }
}
