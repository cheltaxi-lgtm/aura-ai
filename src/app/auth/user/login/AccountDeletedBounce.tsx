"use client";

import { useEffect } from "react";
import { consumeAccountDeletedHomeRedirect } from "@/lib/account-deleted";

/** Tiny client island — keeps the login page itself a server component. */
export default function AccountDeletedBounce() {
  useEffect(() => {
    consumeAccountDeletedHomeRedirect();
  }, []);
  return null;
}
