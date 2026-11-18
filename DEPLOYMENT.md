# Publishing the website

- Existing website: https://wakeral.github.io/ADS401-Group-I/
- MY version: https://wakeral.github.io/ADS401-Group-I/my/

The Pages workflow combines the current `main` branch at the site root and
the current `MY` branch in `my/`. Their HTML, CSS, scripts, PDFs, and other
assets remain separate. It refuses to overwrite an existing `main/my/` path.

The same workflow is kept on both branches. Only the workflow file needs to
change on `main`; the existing website's page and asset files stay on `main`.
The `github-pages` environment continues to allow deployments from `main`.

After pushing changes to `MY`, open **Actions → Deploy website and MY preview
to Pages → Run workflow**, select **main**, and run it to publish the update.
A push to `main` also publishes both versions, preserving `my/`.

For local development, serve this checkout normally and open `index.html`.
The additional `my/` prefix is applied only when the Pages artifact is built.
