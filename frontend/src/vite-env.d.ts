/// <reference types="vite/client" />

declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: unknown;
}

declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}

declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_DEV_PROXY?: string;
  readonly VITE_FILE_COLLECTION_UPLOAD_URL?: string;
  readonly VITE_YANDEX_MAPS_API_KEY?: string;
  readonly VITE_ALLOW_LOCAL_AUTH?: string;
  readonly VITE_ADMIN_DESK_SLUG?: string;
  readonly VITE_SMARTCAPTCHA_CLIENT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
