import { removeTestUser } from "./db";

export default async function globalTeardown() {
  await removeTestUser();
}
