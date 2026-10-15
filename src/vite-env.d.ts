/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_BROWSER_API?: string
  readonly VITE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
