/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес, по которому будет жить эта сборка. См. SITE в src/lib/types.ts. */
  readonly VITE_SITE?: string
  /** Эндпоинт функции приёма заявок. */
  readonly VITE_LEAD_ENDPOINT?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
