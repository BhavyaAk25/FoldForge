# Third-party notices

FoldForge source code is MIT licensed. Direct runtime and development dependencies remain under their respective licenses.

| Dependency           | Purpose               | Version | License    | Source / attribution                        |
| -------------------- | --------------------- | ------: | ---------- | ------------------------------------------- |
| Next.js              | Application framework | 16.2.10 | MIT        | https://github.com/vercel/next.js           |
| React / React DOM    | User interface        |  19.2.7 | MIT        | https://github.com/facebook/react           |
| OpenAI JS            | Responses API client  |  6.46.0 | Apache-2.0 | https://github.com/openai/openai-node       |
| Zod                  | Runtime validation    |   4.4.3 | MIT        | https://github.com/colinhacks/zod           |
| Geist                | Sans and mono fonts   |   1.7.2 | OFL-1.1    | https://github.com/vercel/geist-font        |
| Vitest / V8 coverage | Tests and coverage    |  4.1.10 | MIT        | https://github.com/vitest-dev/vitest        |
| fast-check           | Property tests        |   4.9.0 | MIT        | https://github.com/dubzzz/fast-check        |
| Prettier             | Formatting            |   3.9.5 | MIT        | https://github.com/prettier/prettier        |
| Three.js             | 3D preview            | 0.185.1 | MIT        | https://github.com/mrdoob/three.js          |
| React Three Fiber    | React 3D renderer     |   9.6.1 | MIT        | https://github.com/pmndrs/react-three-fiber |
| Playwright           | Browser testing       |  1.61.1 | Apache-2.0 | https://github.com/microsoft/playwright     |

No third-party dependency is modified. `pnpm licenses list --prod --json` generates the complete installed production dependency report for each release environment. The lockfile is the reproducible component inventory; the report is generated rather than committed because it contains machine-specific installation paths.

Notable transitive/runtime artifacts:

- Geist font files are redistributed to browsers under SIL Open Font License 1.1. The copyright and complete license text are retained in `licenses/GEIST-OFL-1.1.txt`.
- Next.js may install Sharp (Apache-2.0) and a platform-specific libvips binary (LGPL-3.0-or-later) for image tooling. FoldForge does not modify these packages. Deployment packagers must retain notices and satisfy the applicable LGPL source/relocation requirements described in `licenses/README.md`.
- `caniuse-lite` data is CC-BY-4.0; the package metadata and lockfile retain its attribution.

Related work is cited for context only and is not incorporated: FOLD, OrigamiSimulator, COrigami, Learn2Fold, rigid-origami optimization, TreeMaker, and Origamizer.
