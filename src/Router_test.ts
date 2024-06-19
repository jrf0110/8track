import test from 'ava'
import { Headers, Response } from 'node-fetch'
const makeServiceWorkerEnv = require('service-worker-mock')
import { Router } from './Router'

function mockGlobal() {
  Object.assign(global, makeServiceWorkerEnv(), { Headers, Response })
}

test('.getMatchingRoutes() empty for non-matches', (t) => {
  mockGlobal()

  const r = new Router()

  t.deepEqual(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/'), 'GET'), [])

  r.get`/api/users`.handle((ctx) => ctx.end('users-list'))

  t.deepEqual(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/'), 'GET'), [])
})

test('.getMatchingRoutes() matches no path no vars', (t) => {
  mockGlobal()

  const r = new Router().get`/api/users`.handle((ctx) => ctx.end('users-list')).router()

  t.deepEqual(
    r
      .getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/api/users'), 'GET')
      .map((m) => [m.route.original, m.params]),
    [['/api/users', {}]],
  )
})

test('.getMatchingRoutes() matches with and without trailing slash', (t) => {
  mockGlobal()

  const r = new Router()
  r.get`/api/users`.handle((ctx) => ctx.end('users-list'))

  t.deepEqual(
    r
      .getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/api/users/'), 'GET')
      .map((m) => [m.route.original, m.params]),
    [['/api/users', {}]],
  )

  t.deepEqual(
    r
      .getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/api/users'), 'GET')
      .map((m) => [m.route.original, m.params]),
    [['/api/users', {}]],
  )
})

test('.getMatchingRoutes() matches with vars', (t) => {
  mockGlobal()

  const r = new Router()

  r.get`/api/users`.handle((ctx) => ctx.end('users-list'))
  r.get`/api/users/:id`.handle((ctx) => ctx.end('user-get'))

  t.deepEqual(
    r
      .getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/api/users/123'), 'GET')
      .map((m) => [m.route.original, m.params]),
    [['/api/users/:id', { id: '123' }]],
  )
})

test('.getMatchingRoutes() works with hostnames', (t) => {
  mockGlobal()

  const r = new Router()

  r.get`https?://`.handle((ctx) => ctx.end('users-list'))
  r.get`/api/users/:id`.handle((ctx) => ctx.end('user-get'))

  t.deepEqual(
    r
      .getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/api/users/123'), 'GET')
      .map((m) => [m.route.original, m.params]),
    [['/api/users/:id', { id: '123' }]],
  )
})

test('helper methods work', (t) => {
  mockGlobal()

  const r = new Router()

  r.get`/get`.handle((ctx) => ctx.end('hi'))
  r.post`/post`.handle((ctx) => ctx.end('hi'))
  r.put`/put`.handle((ctx) => ctx.end('hi'))
  r.patch`/patch`.handle((ctx) => ctx.end('hi'))
  r.delete`/delete`.handle((ctx) => ctx.end('hi'))
  r.options`/options`.handle((ctx) => ctx.end('hi'))
  r.all`/all`.handle((ctx) => ctx.end('hi'))

  t.is(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/get'), 'GET').length, 1)
  t.is(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/post'), 'POST').length, 1)
  t.is(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/put'), 'PUT').length, 1)
  t.is(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/patch'), 'PATCH').length, 1)
  t.is(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/delete'), 'DELETE').length, 1)
  t.is(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/options'), 'OPTIONS').length, 1)
  t.is(r.getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/all'), 'ALL').length, 1)
})

test('middleware should work', async (t) => {
  mockGlobal()

  const r = new Router()

  const history: string[] = []

  r.all`(.*)`.use(async (ctx, next) => {
    history.push('all-*')
    ctx.response.headers.append('All-Star-Before-Next', 'True')
    await next()
    ctx.response.headers.append('All-Star-After-Next', 'True')
    history.push('all-*-after-next')
  })

  r.get`/users/${'userId'}`.use(async (ctx, next) => {
    t.deepEqual(ctx.params, { userId: '123' })

    history.push(`get-userId-middleware-${ctx.params.userId}`)
    await next()
    ctx.response.headers.set('Users-UserID-After-Next', 'True')
    history.push(`get-userId-after-middleware-${ctx.params.userId}`)
  })

  r.get`/users/${'id'}`
    .use(async (ctx, next) => {
      history.push(`get-user-middleware-${ctx.params.id}`)
      await next()
      history.push(`get-user-after-middleware-${ctx.params.id}`)
    })
    .use(async (ctx, next) => {
      history.push(`get-user-2-middleware-${ctx.params.id}`)
      await next()
      history.push(`get-user-2-after-middleware-${ctx.params.id}`)
    })
    .handle(async (ctx) => {
      history.push(`responding-${ctx.params.id}`)
      ctx.end('hi')
    })

  const res = await r.getResponseForEvent({
    request: { url: 'http://foo.bar/users/123', method: 'GET' },
  } as FetchEvent)

  t.deepEqual(history, [
    'all-*',
    'get-userId-middleware-123',
    'get-user-middleware-123',
    'get-user-2-middleware-123',
    'responding-123',
    'get-user-2-after-middleware-123',
    'get-user-after-middleware-123',
    'get-userId-after-middleware-123',
    'all-*-after-next',
  ])

  if (res) {
    t.is(res.headers.get('All-Star-Before-Next'), 'True')
    t.is(res.headers.get('Users-UserID-After-Next'), 'True')
    t.is(res.headers.get('All-Star-After-Next'), 'True')
    t.is(await res.text(), 'hi')
  } else {
    t.fail('Response was undefined')
  }
})

test('first response returned should resolve stack', async (t) => {
  mockGlobal()

  const r = new Router()

  const history: string[] = []

  r.all`(.*)`.use(async (ctx, next) => {
    history.push('all-*')
    await next()
    history.push('all-*-after-next')
  })

  r.get`/users/${'userId'}`.use(async (ctx, next) => {
    history.push(`get-userId-middleware-${ctx.params.userId}`)
    await next()
    history.push(`get-userId-after-middleware-${ctx.params.userId}`)
  })

  r.get`/users/${'id'}`
    .use(async (ctx, next) => {
      if (ctx.params.id === 'bail-early') {
        return ctx.end('whoa')
      }

      history.push(`get-user-middleware-${ctx.params.id}`)
      await next()
      history.push(`get-user-after-middleware-${ctx.params.id}`)
    })
    .use(async (ctx, next) => {
      history.push(`get-user-2-middleware-${ctx.params.id}`)
      await next()
      history.push(`get-user-2-after-middleware-${ctx.params.id}`)
    })
    .handle(async (ctx) => {
      if (ctx.params.id === 'bail-early') {
        t.fail('Request should have bailed early, so this should not be called')
      }

      history.push(`responding-${ctx.params.id}`)
      return ctx.end('hi')
    })

  r.get`/users/${'id'}`.handle(async (ctx) => {
    t.fail('should never get called')
    return ctx.end('hi')
  })

  r.all`(.*)`.handle((ctx) => ctx.end('Not found', { status: 404 }))

  let res = await r.getResponseForEvent({
    request: { url: 'http://foo.bar/users/123', method: 'GET' },
  } as FetchEvent)

  t.deepEqual(history, [
    'all-*',
    'get-userId-middleware-123',
    'get-user-middleware-123',
    'get-user-2-middleware-123',
    'responding-123',
    'get-user-2-after-middleware-123',
    'get-user-after-middleware-123',
    'get-userId-after-middleware-123',
    'all-*-after-next',
  ])

  if (res) {
    t.is(await res.text(), 'hi')
  } else {
    t.fail('Response was undefined')
  }

  res = await r.getResponseForEvent({
    request: { url: 'http://foo.bar/users/bail-early', method: 'GET' },
  } as FetchEvent)

  if (res) {
    t.is(await res.text(), 'whoa')
  } else {
    t.fail('Response was undefined')
  }

  res = await r.getResponseForEvent({
    request: { url: 'http://foo.bar/no-route', method: 'GET' },
  } as FetchEvent)

  if (res) {
    t.is(await res.text(), 'Not found')
  } else {
    t.fail('Response was undefined')
  }
})

test('response editing in middleware should work', async (t) => {
  mockGlobal()

  const r = new Router()

  r.all`(.*)`.use(async (ctx, next) => {
    ctx.response.headers.set('X-Testing', 'test')
    await next()
  })

  r.get`/foo`.handle((ctx) => ctx.end('hi'))

  const res = await r.getResponseForEvent({
    request: { url: 'http://foo.bar/foo', method: 'GET' },
  } as FetchEvent)

  if (res) {
    t.is(await res.text(), 'hi')
    t.is(res.headers.get('x-testing'), 'test')
  } else {
    t.fail('Response was undefined')
  }
})

test('multiple params specified should all be defined', async (t) => {
  mockGlobal()

  const r = new Router()

  // [type, userId, bookId]
  const result: [string, string, string][] = []

  r.get`/users/${'userId'}/books/${'bookId'}`.use(async (ctx, next) => {
    result.push(['middleware', ctx.params.userId, ctx.params.bookId])
    await next()
  })

  r.get`/users/${'userId'}/books/${'bookId'}`.handle(async (ctx) => {
    result.push(['handler', ctx.params.userId, ctx.params.bookId])
  })

  await r.getResponseForEvent({
    request: { url: 'http://foo.bar/users/123/books/456', method: 'GET' },
  } as FetchEvent)

  t.deepEqual(result, [
    ['middleware', '123', '456'],
    ['handler', '123', '456'],
  ])
})

test('routers should be composable', (t) => {
  mockGlobal()

  const apiRouter = new Router()
  const usersRouter = new Router()
  const userBooksRouter = new Router()

  usersRouter.get`/`.handle((ctx) => ctx.end('users-list'))
  usersRouter.get`/${'userId'}`.handle((ctx) => ctx.end(`user: ${ctx.params.userId}`))
  userBooksRouter.get`/`.handle((ctx) => ctx.end('books-list'))
  userBooksRouter.get`/${'bookId'}`.handle((ctx) => ctx.end(`book: ${ctx.params.bookId}`))

  usersRouter.all`/${'userId'}/books`.use(userBooksRouter)
  apiRouter.all`/api/users`.use(usersRouter)

  t.deepEqual(
    apiRouter
      .getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/api/users/123'), 'GET')
      .map((m) => [m.route.original, m.params]),
    [['/api/users/:userId', { userId: '123' }]],
  )

  t.deepEqual(
    apiRouter
      .getMatchingRoutesForURLAndMethod(new URL('http://foo.bar/api/users/123/books/'), 'GET')
      .map((m) => [m.route.original, m.params]),
    [['/api/users/:userId/books', { userId: '123' }]],
  )

  t.deepEqual(
    apiRouter
      .getMatchingRoutes({ method: 'GET', url: 'http://foo.bar/api/users/123/books/456' })
      .map((m) => [m.route.original, m.params]),
    [['/api/users/:userId/books/:bookId', { userId: '123', bookId: '456' }]],
  )
})

test('ctx.end should properly merge status code', async (t) => {
  mockGlobal()

  const r = new Router()

  r.get`/foo`.handle((ctx) => ctx.end(new Response('', { status: 501 }) as any))
  r.get`/bar`.handle((ctx) => ctx.end('', { status: 500 }))

  let res = await r.getResponseForEvent({
    request: { url: 'http://foo.bar/foo', method: 'GET' },
  } as FetchEvent)

  if (!res) {
    t.fail('No response returned for event')
    return
  }

  t.is(res.status, 501)

  res = await r.getResponseForEvent({
    request: { url: 'http://foo.bar/bar', method: 'GET' },
  } as FetchEvent)

  if (!res) {
    t.fail('No response returned for event')
    return
  }

  t.is(res.status, 500)
})
