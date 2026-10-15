import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const sandbox = process.env.VITE_SANDBOX === "true";

function sandboxIndexing(): Plugin {
  return {
    name: "sandbox-indexing",
    transformIndexHtml(html) {
      if (!sandbox) return html;
      if (html.includes('name="robots"')) return html;
      return html.replace(
        "</head>",
        '    <meta name="robots" content="noindex" />\n  </head>',
      );
    },
    async writeBundle(options) {
      if (!sandbox) return;
      const dir = options.dir ?? path.resolve("dist");
      await writeFile(path.join(dir, "robots.txt"), "User-agent: *\nDisallow: /\n");
    },
  };
}

function prerenderApp(): Plugin {
  return {
    name: "prerender-app",
    apply: "build",
    async closeBundle() {
      const { createServer } = await import("vite");
      const server = await createServer({
        base: "./",
        mode: "production",
        server: { middlewareMode: true, hmr: false },
        appType: "custom",
      });
      try {
        const { render } = (await server.ssrLoadModule("/src/entry-server.tsx")) as {
          render: () => string;
        };
        let appHtml = render().replace(/"\/assets\//g, '"./assets/');
        const preloads = [...appHtml.matchAll(/<link rel="preload"[^>]*>/g)].map((match) => match[0]);
        appHtml = appHtml.replace(/<link rel="preload"[^>]*>/g, "");
        const indexPath = path.resolve("dist/index.html");
        let html = await readFile(indexPath, "utf8");
        if (preloads.length) {
          html = html.replace("</head>", `    ${preloads.join("\n    ")}\n  </head>`);
        }
        html = html.replace(/<div id="root"><\/div>/, `<div id="root">${appHtml}</div>`);
        await writeFile(indexPath, html);
      } finally {
        await server.close();
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), sandboxIndexing(), prerenderApp()],
  server: {
    host: "0.0.0.0",
    port: 43221,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 43221,
    strictPort: true,
  },
});
