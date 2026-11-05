import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: {
      index: "src/index.ts",
      mocks: "src/mocks/index.ts",
    },
    platform: "neutral",
    dts: {
      generator: "tsgo",
    },
    exports: true,
    publint: true,
    attw: {
      profile: "esm-only",
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 15_000,
        },
      },
    ],
    coverage: {
      include: ["src/**/*.ts"],
    },
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
