## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment

- `NEXT_PUBLIC_API_URL` - base URL of the backend API, used for sign-in, session lookup, and logout.
- `COOKIE_DOMAIN` - optional; set it to the same value as the backend's `COOKIE_DOMAIN` so logout clears the `otto_session_token` cookie on that domain.
  Leave it unset when the backend does not set a cookie domain.
