import { AppBar } from "@/components/app-bar";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?reason=unauthorized");
  }
  return (
    <>
      <AppBar user={user} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </>
  );
}
