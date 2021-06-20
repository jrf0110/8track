import { getErrorPageHTML } from './cfErrorMiddleware'
import { Router } from './Router'
import { defaults } from './util'

interface CreateEventHandlerOptions {
  router: Router
  event: FetchEvent
  debug?: boolean
}

export function handle(options: CreateEventHandlerOptions) {
  const { event, router, debug } = defaults(options, {
    debug: false,
  })

  event.respondWith(
    (async () => {
      if (!debug) return (await router.getResponseForEvent(event)) as any

      try {
        const res = await router.getResponseForEvent(event)

        if (res) return res

        throw new Error('Not found')
      } catch (e) {
        return new Response(getErrorPageHTML(event.request, e), {
          headers: {
            'Content-Type': 'text/html',
          },
        })
      }
    })(),
  )
}
