/// <reference types="vite/client" />

// Declared explicitly: Vite's own ImportMetaEnv has an index signature typed
// `any`, so an undeclared VITE_* variable reads as `any` and strict mode has
// nothing to check. Optional because the code falls back to localhost.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
