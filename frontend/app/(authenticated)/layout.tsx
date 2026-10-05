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
      {children}
    </>
  );
}
