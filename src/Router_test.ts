import test from 'ava'
const makeServiceWorkerEnv = require('service-worker-mock')
import { Router, Context, Middleware } from './Router'

function mockGlobal() {
  Object.assign(global, makeServiceWorkerEnv())
}

test('.getMatchingRoutes() empty for non-matches', t => {
  mockGlobal()

  const r = new Router()

  t.deepEqual(r.getMatchingRoutes({ url: '/', method: 'GET' }), [])

  r.get`/api/users`.handle(() => new Response('users-list'))

  t.deepEqual(r.getMatchingRoutes({ url: '/', method: 'GET' }), [])
})

test('.getMatchingRoutes() matches no path no vars', t => {
  mockGlobal()

  const r = new Router().get`/api/users`.handle(() => new Response('users-list')).router()

  t.deepEqual(
    r
      .getMatchingRoutes({ method: 'GET', url: 'http://foo.bar/api/users' })
      .map(m => [m.route.original, m.params]),
    [['/api/users', {}]],
  )
})

test('.getMatchingRoutes() matches with vars', t => {
  mockGlobal()

  const r = new Router()

  r.get`/api/users`.handle(() => new Response('users-list'))
  r.get`/api/users/:id`.handle(() => new Response('user-get'))

  t.deepEqual(
    r
      .getMatchingRoutes({ method: 'GET', url: 'http://foo.bar/api/users/123' })
      .map(m => [m.route.original, m.params]),
    [['/api/users/:id', { id: '123' }]],
  )
})

test('.getMatchingRoutes() works with hostnames', t => {
  mockGlobal()

  const r = new Router()

  r.get`https?://`.handle(() => new Response('users-list'))
  r.get`/api/users/:id`.handle(() => new Response('user-get'))

  t.deepEqual(
    r
      .getMatchingRoutes({ method: 'GET', url: 'http://foo.bar/api/users/123' })
      .map(m => [m.route.original, m.params]),
    [['/api/users/:id', { id: '123' }]],
  )
})

test('helper methods work', t => {
  mockGlobal()

  const r = new Router()

  r.get`/get`.handle(() => new Response('hi'))
  r.post`/post`.handle(() => new Response('hi'))
  r.put`/put`.handle(() => new Response('hi'))
  r.patch`/patch`.handle(() => new Response('hi'))
  r.delete`/delete`.handle(() => new Response('hi'))
  r.options`/options`.handle(() => new Response('hi'))
  r.all`/all`.handle(() => new Response('hi'))

  t.is(r.getMatchingRoutes({ url: '/get', method: 'GET' }).length, 1)
  t.is(r.getMatchingRoutes({ url: '/post', method: 'POST' }).length, 1)
  t.is(r.getMatchingRoutes({ url: '/put', method: 'PUT' }).length, 1)
  t.is(r.getMatchingRoutes({ url: '/patch', method: 'PATCH' }).length, 1)
  t.is(r.getMatchingRoutes({ url: '/delete', method: 'DELETE' }).length, 1)
  t.is(r.getMatchingRoutes({ url: '/options', method: 'OPTIONS' }).length, 1)
  t.is(r.getMatchingRoutes({ url: '/all', method: 'ALL' }).length, 1)
})

test('middleware should work', async t => {
  mockGlobal()

  const r = new Router()

  const history: string[] = []

  r.all`(.*)`.use(async (ctx, next) => {
    history.push('all-*')
    await next()
    history.push('all-*-after-next')
  })

  r.get`/users/${'userId'}`.use(async (ctx, next) => {
    t.deepEqual(ctx.params, { userId: '123' })

    history.push(`get-userId-middleware-${ctx.params.userId}`)
    await next()
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
    .handle(async ctx => {
      history.push(`responding-${ctx.params.id}`)
      return new Response('hi')
    })

  const res = await r.getResponseForRequest({ url: '/users/123', method: 'GET' } as Request)

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
})

test('first response returned should resolve stack', async t => {
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
        return new Response('whoa')
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
    .handle(async ctx => {
      if (ctx.params.id === 'bail-early') {
        t.fail('Request should have bailed early, so this should not be called')
      }

      history.push(`responding-${ctx.params.id}`)
      return new Response('hi')
    })

  r.get`/users/${'id'}`.handle(async ctx => {
    t.fail('should never get called')
    return new Response('hi')
  })

  r.all`(.*)`.handle(ctx => new Response('Not found', { status: 404 }))

  let res = await r.getResponseForRequest({ url: '/users/123', method: 'GET' } as Request)

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

  res = await r.getResponseForRequest({ url: '/users/bail-early', method: 'GET' } as Request)

  if (res) {
    t.is(await res.text(), 'whoa')
  } else {
    t.fail('Response was undefined')
  }

  res = await r.getResponseForRequest({ url: '/no-route', method: 'GET' } as Request)

  if (res) {
    t.is(await res.text(), 'Not found')
  } else {
    t.fail('Response was undefined')
  }
})
