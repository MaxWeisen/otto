import { proxyApiGet } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;

  return proxyApiGet(`/api/vpic/decode/${encodeURIComponent(vin)}`);
}
