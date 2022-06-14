import pathToRegExp from 'path-to-regexp'
import { Context } from './Context'
import { pathJoin } from './path'

export type Handler<ContextData = any, Params = any> = (
  ctx: Context<ContextData, Params>,
  next?: () => Promise<void>,
) => any

export type Middleware<ContextData = any, Params = any> = (
  ctx: Context<ContextData, Params>,
  next: () => Promise<void>,
) => any

export type Method = 'ALL' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface Route {
  readonly original: string
  readonly pattern: readonly [RegExp, pathToRegExp.Token[]]
  readonly handler: Handler | Middleware
  readonly method: Method
}

export interface RouteMatch {
  params: any
  route: Route
}

type RouteRequest = Pick<Request, 'url' | 'method'>

export interface RouteTagResult<ContextData, Params> {
  /**
   * Handle a request
   */
  handle: (handler: Handler<ContextData, Params>) => RouteTagResult<ContextData, Params>
  /**
   * Mount middleware
   */
  use: (handler: Middleware<ContextData, Params> | Router) => RouteTagResult<ContextData, Params>
  /**
   * Get back the original router instance
   */
  router: () => Router<ContextData>
}

export class Router<ContextData = any> {
  public routes: Route[] = []

  all = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('ALL', strings, paramNames)

  get = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('GET', strings, paramNames)

  post = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('POST', strings, paramNames)

  put = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('PUT', strings, paramNames)

  patch = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('PATCH', strings, paramNames)

  delete = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('DELETE', strings, paramNames)

  head = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('HEAD', strings, paramNames)

  options = <A extends string, T extends { [K in A]: string }>(
    strings: TemplateStringsArray,
    ...paramNames: A[]
  ) => this.methodResult<A, T>('OPTIONS', strings, paramNames)

  private methodResult = <Param extends string, Vars extends { [K in Param]: string }>(
    method: Method,
    strings: TemplateStringsArray,
    paramNames: Param[],
  ) => {
    let original = strings.reduce((result, str, i) => {
      const paramString = ((paramNames as any)[i] && `:${(paramNames as any)[i]}`) || ''
      return `${result}${str}${paramString}`
    }, '')

    // Don't allow explicitly setting trailing slash as this makes
    // Makes it explicitly required
    if (original.endsWith('/')) {
      original = original.substring(0, original.length - 1)
    }

    const pattern = [pathToRegExp(original), pathToRegExp.parse(original)] as const

    const result: RouteTagResult<ContextData, Vars> = {
      use: (routerOrHandler: Middleware<ContextData, Vars> | Router) => {
        if (routerOrHandler instanceof Router) {
          const router = routerOrHandler
          router.routes.forEach((route) => {
            const routeOriginal = pathJoin(original, route.original)
            this.routes.push({
              original: routeOriginal,
              pattern: [pathToRegExp(routeOriginal), pathToRegExp.parse(routeOriginal)],
              handler: route.handler,
              method: route.method,
            })
          })
        } else {
          const handler = routerOrHandler
          this.routes.push({ original, pattern, handler, method })
        }

        return result
      },

      handle: (handler: Handler<ContextData, Vars>) => {
        this.routes.push({ original, pattern, handler, method })
        return result
      },

      router: () => this,
    }

    return result
  }

  getMatchingRoutesForURLAndMethod(url: URL, targetMethod: string) {
    return this.routes.reduce((result, route) => {
      const {
        pattern: [pattern, routeTokens],
        method,
        original,
      } = route

      if (method !== 'ALL' && method !== targetMethod) return result

      // const [patternRegex, patternParse] = pattern
      const patternResult = pattern.exec(original.startsWith('http') ? url.href : url.pathname)

      if (!patternResult) return result

      const params: { [key: string]: string } = {}

      // Starting from 1 because 0 is the whole pathname
      // Params start from index 1
      let patternResultIndex = 1

      for (let i = 0; i < routeTokens.length; i++) {
        if (typeof routeTokens[i] === 'string') {
          continue
        } else {
          const token: pathToRegExp.Key = routeTokens[i] as any
          params[token.name] = patternResult[patternResultIndex++]
        }
      }

      result.push({ params, route })

      return result
    }, [] as RouteMatch[])
  }

  /**
   * @deprecated
   */
  getMatchingRoutes(request: RouteRequest): RouteMatch[] {
    const url = !request.url.startsWith('http')
      ? new URL(`http://domain${request.url.startsWith('/') ? '' : '/'}${request.url}`)
      : new URL(request.url)

    return this.getMatchingRoutesForURLAndMethod(url, request.method)
  }

  /**
   * This function is tricky due to the stack-nature of async-middlware
   * systems. Where a `.handle` is the last function called, but the
   * first function resolved. There's some tail recursion here. I hope
   * to add a better description here later.
   *
   * @param event FetchEvent
   * @returns Promise<Response>
   */
  async getResponseForEvent(event: FetchEvent) {
    const url = !event.request.url.startsWith('http')
      ? new URL(`http://domain${event.request.url.startsWith('/') ? '' : '/'}${event.request.url}`)
      : new URL(event.request.url)
    const matchingRoutes = this.getMatchingRoutesForURLAndMethod(url, event.request.method)

    if (matchingRoutes.length === 0) return

    const data = {}
    const response = new Response()
    let ctx: Context = new Context({
      event,
      response,
      params: {},
      data,
      url,
    })

    // Adapted from koa-compose https://github.com/koajs/compose/blob/master/index.js
    let index = -1

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times')
      // Last route did not handle response, just return
      if (i === matchingRoutes.length) return
      index = i
      const { route, params } = matchingRoutes[i]
      // Manage each middleware's scope to params
      ;(ctx as any).params = params

      await route.handler(ctx, dispatch.bind(null, i + 1))

      // As the middleware undwinds, reset the params so that each
      // middleware after awaiting next() still has the appropriate
      // reference to params
      if (i > 0)
        (ctx as any).params = matchingRoutes[i - 1].params
    }

    await dispatch(0)
    return ctx.response
  }
}
