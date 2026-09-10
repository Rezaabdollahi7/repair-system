import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function stubs(): Plugin {
  const MAP: Record<string, string> = {
    "src/api/index.ts": "preview/mockApi.ts",
    "src/context/AuthContext.tsx": "preview/mockAuth.tsx",
    "src/context/ModalContext.tsx": "preview/mockModal.tsx",
    "src/context/ThemeContext.tsx": "preview/mockTheme.tsx",
    "src/context/SubscriptionContext.tsx": "preview/mockSubscription.tsx",
  };
  return {
    name: "preview-stubs",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const rel = path.relative(ROOT, resolved.id).replace(/\\/g, "/");
      const stub = MAP[rel];
      return stub ? path.join(ROOT, stub) : null;
    },
  };
}

export default defineConfig({
  root: ROOT,
  plugins: [stubs(), react(), tailwindcss()],
  server: { port: 5199, strictPort: true },
});
