import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/home");
  }
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            DIY With Otto
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Dive into all of your automotive repairs with the confidence to get
            it done right.
          </p>
        </div>

        <div className="flex w-100 justify-end gap-6 sm:items-end sm:text-right">
          <Button render={<Link href="/login" />} nativeButton={false}>
            Signup or Login
          </Button>
        </div>
      </main>
    </div>
  );
}
