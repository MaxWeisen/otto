import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-2">
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
