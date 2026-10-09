/**
 * Google sign-in for Gmail access, via Google Identity Services' token flow.
 *
 * The user signs in on Google's own page. The site only receives a short-lived
 * (about 1 hour) read-only access token, kept in memory and never stored or
 * sent anywhere except to Google's own APIs. There's no refresh token, so
 * Testing-mode apps aren't affected by Google's 7-day refresh token expiry.
 */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export const clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID

let gisLoaded: Promise<void> | null = null

/**
 * Loads Google's sign-in script. Call this early (on page load): the sign-in
 * popup must open straight from a click, and waiting for the script after the
 * click can get the popup blocked.
 */
export function loadGoogleIdentity(): Promise<void> {
  gisLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gisLoaded = null
      reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."))
    }
    document.head.appendChild(script)
  })
  return gisLoaded
}

let token: { value: string; expiresAt: number } | null = null

export function hasValidToken(): boolean {
  return token !== null && Date.now() < token.expiresAt - 60_000
}

/** Returns a Gmail access token, opening Google's consent popup if needed. */
export async function getAccessToken(): Promise<string> {
  if (token && hasValidToken()) return token.value
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set. See README.')
  await loadGoogleIdentity()

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, GMAIL_SCOPE)) {
          reject(new Error('Gmail read access was not granted, so Dime! emails cannot be read.'))
          return
        }
        token = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 }
        resolve(response.access_token)
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_closed' ? 'Sign-in window was closed.' : error.message))
      },
    })
    client.requestAccessToken()
  })
}

/** Revokes the site's Gmail access with Google and forgets the token. */
export async function disconnect(): Promise<void> {
  if (!token) return
  const value = token.value
  token = null
  await loadGoogleIdentity()
  await new Promise<void>((resolve) => google.accounts.oauth2.revoke(value, () => resolve()))
}
