# Runtime license notes

Run `pnpm licenses list --prod --json` in the release environment to generate the complete installed production-dependency report. Platform-specific optional packages vary by build target.

## Geist

FoldForge serves Geist font files. The copyright notice and complete SIL Open Font License 1.1 text are retained in `GEIST-OFL-1.1.txt`.

## Sharp and libvips

Next.js can install Sharp under Apache-2.0 and a platform-specific libvips binary under LGPL-3.0-or-later. FoldForge does not modify either package and does not call Sharp directly. A deployment that redistributes the native binary must retain its notices and provide the corresponding source or other access required by LGPL-3.0-or-later. Upstream source and build information are available from:

- https://github.com/libvips/libvips
- https://github.com/lovell/sharp-libvips
- https://sharp.pixelplumbing.com/install/

This note is an engineering inventory, not legal advice. Re-run the license report and inspect the actual deployment trace before distributing a bundled server artifact.
