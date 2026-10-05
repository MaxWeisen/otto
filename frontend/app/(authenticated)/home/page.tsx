import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  return (
    <div>
      <div>You are currently logged in as {user?.name}</div>
    </div>
  );
}
