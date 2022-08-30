export type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T]
export type Defaults<T> = Required<{ [K in OptionalKeys<T>]: T[K] }>

export function defaults<T>(data: T, defaults: Defaults<T>): Required<T> {
  return { ...data, ...defaults } as any
}

export function mergeHeaders(...allHeaders: (Headers | object)[]): Headers {
  const result = new Headers({})

  for (let ithHeader of allHeaders) {
    if (ithHeader instanceof Headers) {
      for (let [k, v] of ithHeader) {
        ithHeader.get('Set-Cookie') !== null ? result.append(k, v) : result.set(k, v)
      }
    } else {
      for (let key in ithHeader) {
        key === 'Set-Cookie'
          ? result.append(key, (ithHeader as any)[key])
          : result.set(key, (ithHeader as any)[key])
      }
    }
  }

  return result
}
