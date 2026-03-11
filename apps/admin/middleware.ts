import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isTestingBypass =
  process.env.NEXT_PUBLIC_E2E_TESTING === "true" &&
  process.env.NODE_ENV !== "production";
const isSignInRoute = createRouteMatcher(["/sign-in(.*)"]);

// In e2e testing mode, bypass Clerk entirely (including key validation)
// In production, ALL admin routes require authentication (except sign-in)
const handler = isTestingBypass
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (!isSignInRoute(req)) {
        await auth.protect();
      }
    });

export default handler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
