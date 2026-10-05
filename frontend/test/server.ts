import { setupServer } from "msw/node";

/** The MSW server shared by all tests. Tests add handlers with server.use. */
export const server = setupServer();

/** The backend URL the app calls, from NEXT_PUBLIC_API_URL. */
export const API_URL = "http://api.test";
