# Third-party notices

## Original interface images

The three photorealistic concept renders under `public/examples/` and the vector
FoldForge app icon were created specifically for this repository. They contain no
external images, fonts, scripts, or trademarks and are distributed under the
repository's MIT license. The cards label the renders as prompt inspiration; they
are not renders of the prepared examples or evidence of generated fabrication geometry.

FoldForge source code is MIT licensed. Direct runtime and development dependencies remain under their respective licenses. This inventory describes the current lockfile and must be regenerated when dependencies change.

| Dependency           | Purpose               |        Version | License    | Source / attribution                           |
| -------------------- | --------------------- | -------------: | ---------- | ---------------------------------------------- |
| Next.js              | Application framework |        16.2.10 | MIT        | https://github.com/vercel/next.js              |
| React / React DOM    | User interface        |         19.2.7 | MIT        | https://github.com/facebook/react              |
| OpenAI JS            | Responses API client  |         6.46.0 | Apache-2.0 | https://github.com/openai/openai-node          |
| Zod                  | Runtime validation    |          4.4.3 | MIT        | https://github.com/colinhacks/zod              |
| Geist                | Sans and mono fonts   |          1.7.2 | OFL-1.1    | https://github.com/vercel/geist-font           |
| Vitest / V8 coverage | Tests and coverage    |         4.1.10 | MIT        | https://github.com/vitest-dev/vitest           |
| fast-check           | Property tests        |          4.9.0 | MIT        | https://github.com/dubzzz/fast-check           |
| Prettier             | Formatting            |          3.9.5 | MIT        | https://github.com/prettier/prettier           |
| Three.js             | 3D preview            |        0.182.0 | MIT        | https://github.com/mrdoob/three.js             |
| React Three Fiber    | React 3D renderer     |          9.6.1 | MIT        | https://github.com/pmndrs/react-three-fiber    |
| Playwright           | Browser testing       |         1.61.1 | Apache-2.0 | https://github.com/microsoft/playwright        |
| earcut               | Polygon triangulation |          3.2.3 | ISC        | https://github.com/mapbox/earcut               |
| axe-core Playwright  | Accessibility testing |         4.10.2 | MPL-2.0    | https://github.com/dequelabs/axe-core-npm      |
| glTF Validator       | GLB compatibility     | 2.0.0-dev.3.10 | Apache-2.0 | https://github.com/KhronosGroup/glTF-Validator |
| dxf-parser           | DXF compatibility     |          1.1.2 | MIT        | https://github.com/gdsestimating/dxf-parser    |
| FOLD                 | FOLD compatibility    |         0.12.0 | MIT        | https://github.com/edemaine/fold               |

No third-party dependency is modified. `pnpm licenses list --prod --json` generates the complete installed production dependency report for each release environment. The lockfile is the reproducible component inventory; the generated report is not committed because it can contain machine-specific installation paths.

Notable transitive/runtime artifacts:

- Geist font files are redistributed to browsers under SIL Open Font License 1.1. The copyright and complete license text are retained in `licenses/GEIST-OFL-1.1.txt`.
- Next.js may install Sharp (Apache-2.0) and a platform-specific libvips binary (LGPL-3.0-or-later) for image tooling. FoldForge does not modify these packages. Deployment packagers must retain notices and satisfy the applicable LGPL source/relocation requirements described in `licenses/README.md`.
- `caniuse-lite` data is CC-BY-4.0; package metadata and the lockfile retain its attribution.

## Standards and related work

SVG, DXF, glTF/GLB, and FOLD are referenced interoperability standards/specifications. Their names and specifications are not bundled source code. Generated FoldForge artifacts remain the user’s/project’s data and do not embed third-party examples by default.

The following work is cited for context only and is not incorporated: FOLD, OrigamiSimulator, Origamizer, TreeMaker, rigid-origami optimization research, COrigami, and Learn2Fold. Primary links and the exact comparison boundary are recorded in [RESEARCH.md](./RESEARCH.md).

No copied crease pattern, mechanism design, image, paper figure, benchmark dataset, source file, or model output from that related work may be added without a separate license/provenance review and an updated notice.
