import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@metron/ui/components/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Metron",
      },
      {
        name: "description",
        content: "Metron",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return <Button>Click me</Button>;
}
