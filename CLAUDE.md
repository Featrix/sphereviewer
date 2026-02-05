# Sphere Viewer - Claude Code Notes

## Build & Deploy Workflow

1. **Build:** `npm run build:embed` (webpack production build, copies to root)
2. **Deploy:** `./deploy-to-bits.sh` (deploys to bits:/var/www/html/sv)

Always run `npm run build:embed` first, then `./deploy-to-bits.sh` to publish.

Do NOT use `npm run deploy` or `npm run deploy:full`. Use the shell script directly.

## QA

- `make qa` - build + test
- `make test` - headless Playwright tests
- `make test-ui` - interactive test UI

## Key Files

- `featrix_sphere_control.ts` - Core Three.js WebGL engine
- `src/FeatrixSphereEmbedded.tsx` - Main React embedded widget
- `featrix_sphere_display.tsx` - React UI component for display/controls
- `sphere-viewer.js` - Built output (do not edit directly)

## Important Patterns

- `SphereData` interface is incomplete on purpose -- many properties are added dynamically via `as SphereData` cast in `create_new_sphere()`. Pre-existing TS errors from `tsc --noEmit` are expected; webpack build is the real check.
- Points tracked across epochs via `__featrix_row_offset`.
- Cluster colors come from `kColorTable` (12-color palette) or custom per-cluster colors.
- `finalClusterResults` = session-level cluster data used for convergence visualization.
