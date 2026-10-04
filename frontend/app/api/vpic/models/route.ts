import { proxyApiGet } from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = new URLSearchParams({
    make: searchParams.get("make") ?? "",
    year: searchParams.get("year") ?? "",
  });

  return proxyApiGet(`/api/vpic/models?${query}`);
}
