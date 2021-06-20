import { mergeHeaders } from './util'

interface ContextProps<Data = any, Params = any> {
  event: FetchEvent
  response: Response
  params: Params
  data: Data
}
/**
 * Middleware and handler context. Container to read data about a route
 * and to share data between middlewares and handlers
 */

export class Context<Data = any, Params = any> {
  readonly event: FetchEvent
  readonly params: Params
  response: Response
  data: Data

  constructor({ event, response, params, data }: ContextProps<Data, Params>) {
    this.event = event
    this.response = response
    this.params = params
    this.data = data
  }

  end(body: string | ReadableStream | Response | null, responseInit: ResponseInit = {}) {
    if (body instanceof Response) {
      this.response = new Response(body.body, {
        ...this.response,
        ...body,
        headers: mergeHeaders(this.response.headers, body, responseInit.headers || {}),
      })

      return this.response
    }

    this.response = new Response(body, {
      ...this.response,
      ...responseInit,
      headers: mergeHeaders(this.response.headers, responseInit.headers || {}),
    })

    return this.response
  }

  html(body: string | ReadableStream, responseInit: ResponseInit = {}) {
    return this.end(body, {
      ...responseInit,
      headers: mergeHeaders(
        this.response.headers,
        {
          'Content-Type': 'text/html',
        },
        responseInit.headers || {},
      ),
    })
  }

  json(body: any, responseInit: ResponseInit = {}) {
    return this.end(JSON.stringify(body), {
      ...responseInit,
      headers: mergeHeaders(
        this.response.headers,
        {
          'Content-Type': 'application/json',
        },
        responseInit.headers || {},
      ),
    })
  }
}
