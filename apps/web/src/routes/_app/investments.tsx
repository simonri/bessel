import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@metron/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { HoldingsTab } from "./-holdings-tab";
import { SecuritiesTab } from "./-securities-tab";
import { TradesTab } from "./-trades-tab";

export const Route = createFileRoute("/_app/investments")({
  component: Investments,
});

function Investments() {
  return (
    <div className="flex flex-col space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Investments</h2>
      <Tabs defaultValue="holdings" className="flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="securities">Securities</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings" className="min-h-0 flex-1">
          <HoldingsTab />
        </TabsContent>
        <TabsContent value="trades" className="min-h-0 flex-1">
          <TradesTab />
        </TabsContent>
        <TabsContent value="securities" className="min-h-0 flex-1">
          <SecuritiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
