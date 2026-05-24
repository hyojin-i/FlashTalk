"use client";

import { GlobalSocketProvider } from "@/store/GlobalSocketProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <GlobalSocketProvider>{children}</GlobalSocketProvider>;
}
