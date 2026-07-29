// Authentication is carried by the backend's HTTP-only, SameSite session
// cookie. JavaScript never reads or stores the session token.
export function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' }
}
