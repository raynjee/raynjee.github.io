import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // kokoro-js is loaded dynamically via await import() only when the
    // user switches to the Kokoro engine.  Pre-bundling it eager-loads
    // its heavy ONNX Runtime WASM chain at page load and crashes on
    // browsers that don't support it.  Excluding it here lets the
    // dynamic import handle it lazily with proper error boundaries.
    exclude: ["kokoro-js"],
  },
  server: {
    hmr: false,
  },
});
