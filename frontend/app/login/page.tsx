import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { redirect, unstable_rethrow } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  let user = null;

  try {
    user = await getCurrentUser();
  } catch (error) {
    unstable_rethrow(error);
  }

  if (user) {
    redirect("/vehicles");
  }

  const { reason } = await searchParams;
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-2">
      {reason === "unauthorized" && (
        <Toast
          message="Please log in to continue"
          type="error"
          clearParams
        />
      )}
      <h3>Sign in to Otto</h3>
      <Button
        render={
          <a href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google/login`} />
        }
        nativeButton={false}
      >
        Sign in with Google
      </Button>
    </main>
  );
}
