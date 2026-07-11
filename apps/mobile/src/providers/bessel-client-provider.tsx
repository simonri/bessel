import { type Client, createClient } from "@bessel/client/client"
import { createContext, type PropsWithChildren, useContext } from "react"

const IS_DEV = __DEV__;
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || (IS_DEV ? "http://localhost:8100" : "http://vps:8080");

const BesselClientContext = createContext<{
  bessel: Client
}>({
  bessel: createClient({ baseUrl: API_BASE_URL }),
})

export function useBesselClient() {
  const value = useContext(BesselClientContext)
  if (process.env.NODE_ENV !== 'production') {
    if (!value) {
      throw new Error(
        'useBesselClient must be wrapped in a <BesselClientProvider />',
      )
    }
  }
  return value
}

export function BesselClientProvider({ children }: PropsWithChildren) {
  const bessel = createClient({ baseUrl: API_BASE_URL })

  return (
    <BesselClientContext.Provider value={{ bessel }}>
      {children}
    </BesselClientContext.Provider>
  )
}
