interface ImportMetaEnv {
  /** OAuth client ID of a Google Cloud "Web application" client. Public, not a secret. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
