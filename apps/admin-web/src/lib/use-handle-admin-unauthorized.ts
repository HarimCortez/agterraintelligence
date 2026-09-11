/** Mirrors investor-web's `use-handle-unauthorized.ts` — see that file's doc comment. */
"use client";

import { useRouter } from "next/navigation";
import { useAdminAuthStore } from "./admin-auth-store";
import { UnauthorizedError } from "./admin-api-errors";

export function useHandleAdminUnauthorized() {
  const router = useRouter();

  return (error: unknown) => {
    if (error instanceof UnauthorizedError) {
      useAdminAuthStore.getState().logout();
      router.push("/login");
      return true;
    }
    return false;
  };
}
