import pathToRegExp from 'path-to-regexp'

/**
 * Middleware and handler context. Container to read data about a route
 * and to share data between middlewares and handlers
 */
export class Context<Data = any, Params = any> {
  readonly request: Request
  readonly params: Params
  response: Response
  data: Data

  constructor(request: Request, response: Response, params: Params, data: Data) {
    this.request = request
    this.response = response
    this.params = params
    this.data = data
  }

  end(body: string | ReadableStream | Response, responseInit: ResponseInit = {}) {
    if (body instanceof Response) {
      this.response = body
      return this.response
    }

    const headers = [...(this.response.headers as any).entries()].reduce(
      (result, [k, v]: [string, string]) => {
        result[k] = v
        return result
      },
      {} as { [key: string]: string },
    )

    Object.assign(headers, responseInit.headers)

    this.response = new Response(body, {
      ...this.response,
      ...responseInit,
      headers,
    })

    return this.response
  }

  html(body: string | ReadableStream, responseInit: ResponseInit = {}) {
    return this.end(body, {
      ...responseInit,
      headers: {
        'Content-Type': 'text/html',
        ...(responseInit.headers || {}),
      },
    })
  }

  json(body: object, responseInit: ResponseInit = {}) {
    return this.end(JSON.stringify(body), {
      ...responseInit,
      headers: {
        'Content-Type': 'application/json',
        ...(responseInit.headers || {}),
      },
    })
  }
}

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
  use: (handler: Middleware<ContextData, Params>) => RouteTagResult<ContextData, Params>
  /**
   * Get back the original router instance
   */
  router: () => Router<ContextData>
}

export class Router<ContextData = any> {
  private routes: Route[] = []

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
    const original = strings.reduce((result, str, i) => {
      const paramString = ((paramNames as any)[i] && `:${(paramNames as any)[i]}`) || ''
      return `${result}${str}${paramString}`
    }, '')

    const pattern = [pathToRegExp(original), pathToRegExp.parse(original)] as const

    const result: RouteTagResult<ContextData, Vars> = {
      use: (handler: Middleware<ContextData, Vars>) => {
        this.routes.push({ original, pattern, handler, method })
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

  getMatchingRoutes(request: RouteRequest): RouteMatch[] {
    const url = !request.url.startsWith('http')
      ? new URL(`http://domain${request.url.startsWith('/') ? '' : '/'}${request.url}`)
      : new URL(request.url)

    return this.routes.reduce(
      (result, route) => {
        const {
          pattern: [pattern, routeTokens],
          method,
          original,
        } = route

        if (method !== 'ALL' && method !== request.method) return result

        // const [patternRegex, patternParse] = pattern
        const patternResult = pattern.exec(original.startsWith('http') ? url.href : url.pathname)

        if (!patternResult) return result

        const params: { [key: string]: string } = {}

        // Starting from 1 because 0 is the whole pathname
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
      },
      [] as RouteMatch[],
    )
  }

  createContext(request: Request, response: Response, params: any = {}, data: any = {}): Context {
    return new Context(request, response, params, data)
  }

  async getResponseForRequest(request: Request) {
    const matchingRoutes = this.getMatchingRoutes(request)

    if (matchingRoutes.length === 0) return

    const sharedData = {}
    let ctx: Context

    // Adapted from koa-compose https://github.com/koajs/compose/blob/master/index.js
    let index = -1

    const dispatch = (i: number): Promise<Response | undefined> | void => {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      // Last route did not handle response, just return
      if (i === matchingRoutes.length) return
      index = i
      const { route, params } = matchingRoutes[i]
      ctx = this.createContext(request, (ctx && ctx.response) || new Response(), params, sharedData)

      try {
        return Promise.resolve(route.handler(ctx, dispatch.bind(null, i + 1) as any)).then(
          () => ctx.response,
        )
      } catch (err) {
        return Promise.reject(err)
      }
    }

    const p = dispatch(0)

    if (p) return p.then(() => ctx.response)

    return null
  }
}
