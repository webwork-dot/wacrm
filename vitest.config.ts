import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Dummy secrets — encryption.ts / webhook-signature.ts read these
    // at module load. Tests never hit Meta; any 32-byte hex / non-empty
    // string will do. Keep them aligned with CI build env.
    env: {
      ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
      META_APP_SECRET: "test-meta-app-secret",
      SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/convexa_ci",
    },
    clearMocks: true,
  },
});
