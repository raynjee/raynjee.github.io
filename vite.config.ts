import { vlyPlugin } from "@vly-ai/integrations";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // kokoro-js and its transitive deps (phonemizer) are loaded
    // dynamically via await import() only when the user switches to
    // the Kokoro engine.  Pre-bundling them eager-loads their heavy
    // ONNX Runtime WASM chain at page load and crashes on browsers
    // that don't support it.  Excluding them here lets the dynamic
    // import handle them lazily with proper error boundaries.
    exclude: ["kokoro-js", "phonemizer"],
  },
  server: {
    hmr: false,
  },
});
