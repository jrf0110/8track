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
