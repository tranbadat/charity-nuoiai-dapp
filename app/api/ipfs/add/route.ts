const DEFAULT_IPFS_API_URL = "http://127.0.0.1:5001/api/v0/add";

export async function POST(request: Request) {
  const targetUrl =
    process.env.IPFS_API_URL || process.env.NEXT_PUBLIC_IPFS_API_URL || DEFAULT_IPFS_API_URL;

  try {
    const formData = await request.formData();
    const response = await fetch(targetUrl, {
      method: "POST",
      body: formData,
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "text/plain",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`IPFS proxy error: ${message}`, { status: 500 });
  }
}
