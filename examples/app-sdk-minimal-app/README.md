# Minimal App example

A renderer-only Cats App built with the public `@cats-inc/cats-platform/app-sdk` entry.

```sh
npm install --save-dev @cats-inc/cats-platform
node build.mjs --out dist
```

`build.mjs` encodes `cats.app.json` and `renderer/index.html` with `encodeAppPackage`,
checks the archive with `validateRendererAppPackage` against the installed Platform
version, and writes `example.minimal-0.1.0.catsapp`. The same inputs always produce the
same bytes, on any operating system. The renderer uses the host-injected `catsApp`
object; an App never bundles the bridge. Install the archive through Desktop's local
App installation, not by copying files.
