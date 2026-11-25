# Publishing the website

- Production website (`main`): https://wakeral.github.io/ADS401-Group-I/
- Preview (`MY`): https://wakeral.github.io/ADS401-Group-I/my/

The Pages workflow combines the current `main` branch at the site root and
the current `MY` branch in `my/`. Their HTML, CSS, scripts, PDFs, and other
assets remain separate. It refuses to overwrite an existing `main/my/` path.

Merge tested changes into `main` to update the production website. The
`github-pages` environment deploys from `main`.

After pushing changes to `MY`, open **Actions → Deploy website and MY preview
to Pages → Run workflow**, select **main**, and run it to publish the update.
A push to `main` also publishes both versions, preserving `my/`.

For local development, serve this checkout normally and open `index.html`.
The additional `my/` prefix is applied only when the Pages artifact is built.
