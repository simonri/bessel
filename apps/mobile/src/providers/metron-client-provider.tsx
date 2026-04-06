import { type Client, createClient } from "@metron/client/client"
import { createContext, type PropsWithChildren, useContext } from "react"

const IS_DEV = __DEV__;
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || (IS_DEV ? "http://localhost:8100" : "http://vps:8080");

const MetronClientContext = createContext<{
  metron: Client
}>({
  metron: createClient({ baseUrl: API_BASE_URL }),
})

export function useMetronClient() {
  const value = useContext(MetronClientContext)
  if (process.env.NODE_ENV !== 'production') {
    if (!value) {
      throw new Error(
        'useMetronClient must be wrapped in a <MetronClientProvider />',
      )
    }
  }
  return value
}

export function MetronClientProvider({ children }: PropsWithChildren) {
  const metron = createClient({ baseUrl: API_BASE_URL })

  return (
    <MetronClientContext.Provider value={{ metron }}>
      {children}
    </MetronClientContext.Provider>
  )
}
