import { AppBar } from "@/components/app-bar";
import { redirectToLogin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirectToLogin();
  }
  return (
    <>
      <AppBar user={user} />
      {/* The bottom padding lets content scroll clear of the theme toggle. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-8 pb-20 sm:px-6 sm:pt-12 sm:pb-24">
        {children}
      </main>
    </>
  );
}
