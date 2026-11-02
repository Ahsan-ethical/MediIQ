import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

const publicPaths = ["/", "/login", "/register", "/about"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("mediiq_token")?.value;
  const user = token ? verifyToken(token) : null;

  if (publicPaths.some((p) => pathname === p)) {
    if (user) {
      return NextResponse.redirect(new URL(`/${user.role}/dashboard`, request.url));
    }
    return NextResponse.next();
  }

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/patient") && user.role !== "patient") {
    return NextResponse.redirect(new URL(`/${user.role}/dashboard`, request.url));
  }
  if (pathname.startsWith("/doctor") && user.role !== "doctor") {
    return NextResponse.redirect(new URL(`/${user.role}/dashboard`, request.url));
  }
  if (pathname.startsWith("/admin") && user.role !== "admin") {
    return NextResponse.redirect(new URL(`/${user.role}/dashboard`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|public).*)"],
};
