import test from 'ava'
import { Headers } from 'node-fetch'
import { mergeHeaders } from './util'

// something is wrong with my old polyfill but we don't see
// the same issue here
// Basically, iterating over headers [key, val] pair was
// returning the actual names of the variables I used [a, b]
// instead of ['key', 'value']
;(global as any).Headers = Headers
test('mergeHeaders(a, b)', (t) => {
  const a = mergeHeaders(new Headers({ foo: 'bar' }), {
    bar: 'baz',
  })
  t.is(a.get('foo'), 'bar')
  t.is(a.get('bar'), 'baz')
})

test('mergeHeaders(a,b) for multiple Set-Cookie headers', (t) => {
  const a = mergeHeaders(
    new Headers({ 'Set-Cookie': 'test1=1' }),
    new Headers({ 'Set-Cookie': 'test2=2' }),
    new Headers({ foo: 'bar' }),
  )
  t.is(a.get('foo'), 'bar')
  t.is(a.get('Set-Cookie'), 'test1=1, test2=2')
})

test('mergeHeaders(a,b) for Set-Cookie header of type object', (t) => {
  const a = mergeHeaders({ 'Set-Cookie': 'test1=1' }, new Headers({ foo: 'bar' }))
  t.is(a.get('foo'), 'bar')
  t.is(a.get('Set-Cookie'), 'test1=1')
})
test('mergeHeaders(a,b) for Set-Cookie header of type object and header', (t) => {
  const a = mergeHeaders(
    { 'Set-Cookie': 'test1=1' },
    new Headers({ 'Set-Cookie': 'test2=2' }),
    new Headers({ foo: 'bar' }),
  )
  t.is(a.get('foo'), 'bar')
  t.is(a.get('Set-Cookie'), 'test1=1, test2=2')
})
