const argv = require('yargs')
  .usage('Usage: $0 <command> [options]')
  .command(
    'deploy [worker]',
    'Deploy your script',
    (yargs: any) => {
      return yargs.option('worker').option('kv-files')
    },
    (argv: any) => {
      const path = require('path')
      const { promisify } = require('util')
      const readFile = promisify(require('fs').readFile)
      const { StorageArea } = require('storage-kv')
      const fetch = require('isomorphic-fetch')
      const FormData = require('form-data')

      main()

      async function main() {
        console.log('----> Uploading static assets')

        const storage = new StorageArea(process.env.KV_NAMESPACE, {
          credentials: {
            id: process.env.CF_ID,
            email: process.env.CF_EMAIL,
            key: process.env.CF_KEY,
          },
        })

        const kvFiles: unknown = argv.kvFiles
        if (typeof kvFiles === 'string') {
          const files = kvFiles.split(',').map(filePath => path.join(process.cwd(), filePath))

          await files.reduce((promise, pathname, i) => {
            const name = path.basename(pathname)

            return promise.then(async () => {
              console.log(
                `  ${i === 0 ? '\\' : i === files.length - 1 ? '/' : '|'}---> Uploading`,
                name,
              )
              const contents = (await readFile(pathname)).toString()
              return storage.set(path.basename(name), contents)
            })
          }, Promise.resolve())
        }

        const workerPath: unknown = argv.worker

        if (typeof workerPath === 'string') {
          console.log('----> Syncing worker')
          const bindings = [
            {
              name: process.env.KV_VAR_NAME,
              namespace_id: process.env.KV_NAMESPACE_ID,
              type: 'kv_namespace',
            },
          ]

          const formData = new FormData()

          formData.append(
            'metadata',
            JSON.stringify({
              body_part: 'script',
              bindings,
            }),
            {
              contentType: 'application/json',
            },
          )
          formData.append('script', await readFile(path.join(process.cwd(), workerPath)), {
            contentType: 'application/javascript; charset=UTF-8',
          })

          const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ID}/workers/scripts/${
              process.env.CF_SCRIPT_ID
            }`,
            {
              method: 'PUT',
              body: formData,
              headers: {
                'X-Auth-Email': process.env.CF_EMAIL,
                'X-Auth-Key': process.env.CF_KEY,
                ...formData.getHeaders(),
              },
            },
          )

          if (!res.ok) {
            const { errors } = await res.json()
            console.log('----> Errors:')
            errors.forEach((error: { message: string }) => console.log(error.message))
          }
        }

        console.log('----> Complete!')
      }
    },
  ).argv
