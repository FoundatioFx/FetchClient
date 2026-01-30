import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(defineConfig({
  title: "Foundatio FetchClient",
  description:
    "A tiny, typed wrapper around fetch with caching, middleware, rate limiting, and great DX.",
  base: "/",
  ignoreDeadLinks: true,
  markdown: {
    lineNumbers: false,
  },
  vite: {
    plugins: [
      llmstxt({
        ignoreFiles: ["node_modules/**", ".vitepress/**"],
      }),
    ],
  },
  head: [
    [
      "link",
      {
        rel: "icon",
        href:
          "https://raw.githubusercontent.com/FoundatioFx/Foundatio/main/media/foundatio-icon.png",
        type: "image/png",
      },
    ],
    ["meta", { name: "theme-color", content: "#3c8772" }],
  ],
  themeConfig: {
    logo: {
      light:
        "https://raw.githubusercontent.com/FoundatioFx/Foundatio/master/media/foundatio.svg",
      dark:
        "https://raw.githubusercontent.com/FoundatioFx/Foundatio/master/media/foundatio-dark-bg.svg",
    },
    siteTitle: "FetchClient",
    nav: [
      { text: "Guide", link: "/guide/what-is-fetchclient" },
      { text: "API", link: "https://jsr.io/@foundatiofx/fetchclient/doc" },
      { text: "GitHub", link: "https://github.com/FoundatioFx/FetchClient" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            {
              text: "What is FetchClient?",
              link: "/guide/what-is-fetchclient",
            },
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Configuration", link: "/guide/configuration" },
          ],
        },
        {
          text: "Features",
          items: [
            { text: "Caching", link: "/guide/caching" },
            { text: "Middleware", link: "/guide/middleware" },
            { text: "Rate Limiting", link: "/guide/rate-limiting" },
            { text: "Circuit Breaker", link: "/guide/circuit-breaker" },
            { text: "Error Handling", link: "/guide/error-handling" },
          ],
        },
        {
          text: "Testing",
          items: [
            { text: "MockRegistry", link: "/guide/testing" },
          ],
        },
        {
          text: "More",
          items: [
            { text: "Contributing", link: "/guide/contributing" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/FoundatioFx/FetchClient" },
      { icon: "discord", link: "https://discord.gg/6HxgFCx" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2025 Foundatio",
    },
    editLink: {
      pattern:
        "https://github.com/FoundatioFx/FetchClient/edit/main/docs/:path",
    },
    search: {
      provider: "local",
    },
  },
}));
