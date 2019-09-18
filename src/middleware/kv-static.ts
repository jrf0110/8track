import { Middleware } from '../Router'
import { KVNamespace } from '@cloudflare/workers-types'
const cache = { put: (path: string, num: number) => {} }

type CacheOptions = {
  browserTTL: number
  edgeTTL: number
  bypassCache: boolean
}
type KVSiteOptions = {
  /* handle requests that don't exist on the bucket */
  notFoundHandler: (req: Request) => Response | Promise<Response>
  /* configure how the incoming request's path is found in the bucket */
  keyModifier: (path: string) => string
  /* control the cache for all the site's content or on per request bias */
  cacheControl: Partial<CacheOptions> | ((req: Request) => Partial<CacheOptions>)
}
type KVInit = {
  /* Global KV namespace that is bound to the Worker script */
  kv: Pick<KVNamespace, 'get'>
  options: Partial<KVSiteOptions>
}
const defaultCacheControl: CacheOptions = {
  browserTTL: 720,
  edgeTTL: 720,
  bypassCache: false,
}
const defaultKVSiteOptions: KVSiteOptions = {
  notFoundHandler: () => new Response('Not Found', { status: 404 }),
  keyModifier: (url: string) => {
    let parsedUrl = new URL(url)
    let path = parsedUrl.pathname
    return path.endsWith('/') ? path + 'index.html' : path
  },
  cacheControl: defaultCacheControl,
}
/**
 * Streams files out of KV if it exists
 */
export function kvStatic(kvInit: KVInit): Middleware {
  return async (ctx, next) => {
    const mOptions = kvInit.options
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
    let options = Object.assign({}, defaultKVSiteOptions, mOptions)
    // set cache options by either evaluating the handler passed in
    // or whatever settings were passed in
    const evalCacheOpts: Partial<CacheOptions> = (() => {
      switch (typeof mOptions.cacheControl) {
        case 'function':
          return mOptions.cacheControl(ctx.request)
        case 'object':
          return mOptions.cacheControl
        case 'undefined': //just returns default cache settings, but type safe
          return typeof defaultKVSiteOptions.cacheControl === 'function'
            ? defaultKVSiteOptions.cacheControl(ctx.request)
            : defaultKVSiteOptions.cacheControl
      }
    })()
    options.cacheControl = Object.assign({}, defaultCacheControl, evalCacheOpts)

    // TODO first try to match request will cache
    const filename = options.keyModifier(ctx.request.url)
    const ext = filename.substring(filename.lastIndexOf('.') + 1)
    const contentType = contentTypes[ext as keyof typeof contentTypes] || 'text'
    const body = await kvInit.kv.get(filename, 'stream')

    if (options.cacheControl.edgeTTL && !options.cacheControl.bypassCache)
      cache.put(filename, options.cacheControl.edgeTTL)

    if (!body) return ctx.end(await options.notFoundHandler(ctx.request))

    return ctx.end(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `max-age=${options.cacheControl.browserTTL}`,
      },
    })
  }
}
