import { Middleware } from './Router'
import {} from '@cloudflare/workers-types'

// TODO: this doesn't work yet
// export function cfErrorMiddleware(): Middleware {
//   return async (ctx, next) => {
//     try {
//       await next()
//     } catch (e) {
//       ctx.end(getErrorPageHTML(ctx.request, e), {
//         status: 500,
//       })
//     }
//   }
// }

export function getErrorPageHTML(request: Request, error: Error) {
  const errorDetails: [string, string][] = [
    ['Method', request.method],
    ['HTTP', (request.cf || {}).httpProtocol],
    ['TLS Version', (request.cf || {}).tlsVersion],
    ['ASN', (request.cf || {}).asn],
    ['Priority', (request.cf || {}).requestPriority],
    ['Trust Score', ((request.cf || {}).clientTrustScore || '').toString()],
    ['Colo', (request.cf || {}).colo],
    ['CF-Ray', request.headers.get('CF-Ray') || ''],
  ]

  return `
<!DOCTYPE HTML>
<html>
  <head>
    <style>
    html, body {
      margin: 0;
      font-family: sans-serif;
      background: #ff5454;
      color: white;
    }
    .error {
      max-width: 60em;
      margin: 2em auto;
    }
    .error-msg {
      white-space: pre-wrap;
      tab-size: 2;
      font-family:
        Consolas, "Andale Mono WT", "Andale Mono", "Lucida Console", 
        "Lucida Sans Typewriter", "DejaVu Sans Mono", "Bitstream Vera Sans Mono", 
        "Liberation Mono", "Nimbus Mono L", Monaco, "Courier New", Courier, monospace;
      font-size: 3em;
    }

    .error-source {
      font-size: 2em;
      margin-bottom: -1em;
      color: #ffffffd9;
    }

    .error-details {
      display: grid;
      grid-template-columns: repeat(4, 25%);
    }

    .error-detail {
      padding: 1em;
      border: solid 1px #ffffff80;
    }

    .error-detail-title {
      text-transform: uppercase;
      margin-bottom: 0.5em;
      color: #ffffffc7;
    }

    .error-detail-content {
      font-size: 1.2em;
    }
    </style>
  </head>
  <body>
    <div class="error">
      ${/*<div class="error-source">
        ${error.stack}
  </div>*/ ''}
      <pre class="error-msg">${error.message}</pre>
      <div class="error-details">
        ${errorDetails
          .map(
            ([title, content]) => `
          <div class="error-detail">
            <div class="error-detail-title">${title}</div>
            <div class="error-detail-content">${content}</div>
          </div>      
        `,
          )
          .join('\n')}
      </div>
    </div>
  </body>
</html>
  `
}
