import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests live in `tests/` (kept separate from production source); the
    // existing `scripts/check-*.ts` smoke scripts have been re-homed there
    // and broken into focused suites.
    include: ["tests/**/*.test.ts"],
    // DB tests are sequential by design — they share one database and create
    // ephemeral rows. `singleFork` keeps them in one process, but on its own
    // vitest still interleaves files asynchronously, which races: e.g. one
    // file's afterAll deletes a booking while another file's automations tick
    // is mid-iteration over it (FK violation). `fileParallelism: false` forces
    // one-file-at-a-time execution, removing that whole class of flakiness.
    pool: "forks",
    forks: { singleFork: true },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // No globals — each test imports `{ describe, it, expect }` explicitly.
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    // Verbose reporter so CI logs show every assertion's status.
    reporters: process.env.CI ? ["default", "junit"] : "default",
    outputFile: { junit: "./test-results/junit.xml" },
    coverage: {
      // V8 provider — no Babel transform, no source-map roundtrip.
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      // Only measure source code, not tests/scripts/migrations/UI markup.
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.d.ts",
        // Pure-config / infra modules — measuring gives no signal.
        "src/lib/db.ts",
        "src/lib/clock.ts",
        "src/lib/i18n.ts",
        "src/lib/room-palette.ts",
      ],
      // No-regression bar set just below current coverage. Bump as the
      // test suite grows — the goal is "any meaningful test deletion
      // breaks CI", not "every line covered".
      thresholds: {
        lines: 10,
        functions: 10,
        statements: 10,
        branches: 5,
        // Per-module floor for the modules with focused unit tests.
        // Keeps them healthy even as new code lands elsewhere.
        "src/lib/billing.ts": { lines: 90, functions: 90, statements: 90, branches: 70 },
      },
    },
  },
});
