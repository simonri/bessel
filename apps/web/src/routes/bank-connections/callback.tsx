import { createFileRoute } from "@tanstack/react-router";
import { BankConnectionCallbackPage } from "@/components/bank-connections/bank-connection-callback";

export const Route = createFileRoute("/bank-connections/callback")({
  component: BankConnectionCallbackPage,
});
