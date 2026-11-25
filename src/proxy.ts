import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Опреснява сесията на Supabase (бисквитките) преди страниците и API-то.
 * Само опресняване — проверките за достъп са в самите страници/route handlers.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  // Без бисквитка на Supabase няма какво да опресняваме — спестяваме заявката.
  if (!url || !key || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Без статичните файлове и звука (дълги отговори, нямат нужда от сесия).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|api/audio|api/time|.*/audio$|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
