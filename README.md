# datasources-ui

Standalone front end for the [datasources](https://github.com/stefaniabio23/datasources) registry.
Mirrors `generated/index.json` from that repo at load, so it always reflects the live registry.

Editorial-brutalist, static (no build step), light/dark. Neue Haas Grotesk + JetBrains Mono.
Views: table · cards · join map · schema.

Live: https://stefaniabio23.github.io/datasources-ui

Local preview: `python3 -m http.server 8899` then open http://127.0.0.1:8899
