# AGENTS.md — drop-metadata-launchbox

LaunchBox Games Database metadata provider plugin for Drop (#205).

## Toolchain

- Node >= 22, npm 10+
- `npm ci`, `npm run build`, `npm test`, `npm run typecheck`

## Contract

Built on [`@droposs/plugin-sdk`](https://github.com/Heretek-Games/drop-plugin-sdk)
(plugin API v2). The SDK is consumed from the public npm registry
(`@droposs/plugin-sdk@^0.4.0`), so fresh clones and CI installs need no sibling
checkout.

## Upstream API

The provider targets the public LaunchBox Games Database JSON API used by
`gamesdb.launchbox-app.com`:

- `GET https://gamesdb-api.launchbox-app.com/api/search/{query}`
- `GET https://gamesdb-api.launchbox-app.com/api/games/details/{gameId}`
- artwork is served from `https://images.launchbox-app.com/{fileName}`

The public search/details endpoints require no authentication; no API key is
stored or sent.
