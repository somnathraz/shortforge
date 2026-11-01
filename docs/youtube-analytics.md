# Publish Analytics (YouTube · Instagram · Facebook)

Separate dashboard from Desk. Filter by platform in the UI or CLI.

## Run dashboard

```bash
npm run analytics:ui
```

Open **http://127.0.0.1:8790**

Use the **All / YouTube / Instagram / Facebook** filters at the top.

## CLI

```bash
npm run analytics:channel
npm run analytics:channel -- --platform instagram
npm run analytics:factory
npm run analytics:factory -- --platform facebook
npm run analytics:factory -- --platform youtube --episode why-bhishma-lowered-his-bow
npm run analytics:videos -- --limit 20
```

## API

| Route | Purpose |
|-------|---------|
| `GET /api/analytics/overview?platform=all` | Dashboard payload (filterable) |
| `GET /api/analytics/factory?platform=instagram` | Factory ledger + live stats |
| `GET /api/analytics/channel` | YouTube channel only |
| `GET /api/analytics/videos` | Recent YouTube uploads |

`platform` = `all` \| `youtube` \| `instagram` \| `facebook`

## Notes

- **YouTube**: Data API v3 (views / likes / comments)
- **Instagram**: Graph media + insights (views / reach / likes)
- **Facebook**: Page followers + video `views` when the Graph video node supports the id (some Reel ids may show an error and still list from the ledger)
- Stories often expire and won’t return insights
- Uses the same OAuth / tokens as publish (`.env`)
