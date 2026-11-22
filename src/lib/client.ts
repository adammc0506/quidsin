// Helpers shared by the Tab & Tally tools (Secret Santa, Whip-round).

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Calls /api/<tool>/... and turns errors into friendly messages. */
export async function callApi<T>(tool: string, path: string, init?: RequestInit): Promise<T> {
  const base = (import.meta.env.VITE_API_URL || "/").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/${tool}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach Tab & Tally. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

/** Share sheet if available, otherwise copy. Returns "shared" | "copied" | "failed". */
export async function shareOrCopy(title: string, text: string, url: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "failed";
    }
  }
  return copy(`${text} ${url}`);
}

export async function copy(value: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(value);
    return "copied";
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      /* ignore */
    }
    ta.remove();
    return ok ? "copied" : "failed";
  }
}
