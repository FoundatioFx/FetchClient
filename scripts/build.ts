import { build, emptyDir } from "@deno/dnt";

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {
    deno: true,
  },

  declaration: "separate",
  scriptModule: "cjs",
  typeCheck: false,
  test: true,

  importMap: "deno.json",

  package: {
    name: "@foundatiofx/fetchclient",
    version: Deno.args[0],
    repository: {
      type: "git",
      url: "git+https://github.com/foundatiofx/fetchclient.git",
    },
    homepage: "https://github.com/foundatiofx/fetchclient#readme",
    bugs: {
      url: "https://github.com/foundatiofx/fetchclient/issues",
    },
    license: "Apache-2.0",
    description:
      "A typed JSON fetch client with middleware support for Deno, Node and the browser.",
    author: {
      name: "Eric J. Smith",
      email: "eric@exceptionless.com",
      url: "https://exceptionless.com",
    },
    keywords: [
      "Fetch",
      "Middleware",
      "ProblemDetails",
      "Problem",
    ],
  },

  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022", "WebWorker"],
  },

  async postBuild() {
    await Deno.copyFile("license", "npm/license");
    await Deno.copyFile("readme.md", "npm/readme.md");
  },
});
