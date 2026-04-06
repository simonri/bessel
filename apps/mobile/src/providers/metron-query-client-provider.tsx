import { queryClient } from "../../utils/query"
import { QueryClientProvider } from "@tanstack/react-query";

export function MetronQueryClientProvider({
  children,
}: {
  children: React.ReactElement
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}