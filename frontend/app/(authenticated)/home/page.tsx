import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  return (
    <main>
      <div>You are currently logged in as {user?.name}</div>
    </main>
  );
}
