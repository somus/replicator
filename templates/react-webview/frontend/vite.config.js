import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  oxc: { jsx: { development: false } },
  plugins: [
    react(),
    {
      name: "replicator-verification-harness",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html.replace(
            "</body>",
            '<script type="module" src="/src/replicator-harness.ts"></script></body>',
          );
        },
      },
    },
  ],
});
