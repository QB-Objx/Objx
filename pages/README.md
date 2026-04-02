# GitHub Pages

Static documentation site for OBJX.

## Files

- `index.html`: landing page and documentation content
- `styles.css`: visual system and responsive layout
- `app.js`: install preset switcher and copy buttons
- `.nojekyll`: disables Jekyll processing on GitHub Pages

## Deployment

Deployment is handled by:

- `.github/workflows/pages.yml`

The workflow uploads the `pages/` directory directly to GitHub Pages with no build step.

## Repository Setup

In the GitHub repository:

1. Open `Settings > Pages`
2. Set source to `GitHub Actions`
3. Push changes to `main` or `master`

## Update Flow

Edit files inside `pages/` whenever documentation changes.
