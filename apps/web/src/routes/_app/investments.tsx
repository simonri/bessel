import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@bessel/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { HoldingsTab } from "./-holdings-tab";
import { SecuritiesTab } from "./-securities-tab";
import { TradesTab } from "./-trades-tab";

export const Route = createFileRoute("/_app/investments")({
  component: Investments,
});

const TRIGGER_CLASS =
  "h-full flex-none rounded-md border-0 px-3 text-12 font-medium text-white/50 transition-colors duration-150 hover:text-white/80 dark:text-white/50 dark:hover:text-white/80 data-[state=active]:bg-white/10 data-[state=active]:text-white/90 dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white/90 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none";

function Investments() {
  return (
    <Tabs defaultValue="holdings" className="flex flex-col gap-4">
      <TabsList className="h-8 rounded-lg border border-white/[0.07] bg-white/[0.04] p-0.5 group-data-[orientation=horizontal]/tabs:h-8">
        <TabsTrigger value="holdings" className={TRIGGER_CLASS}>
          Holdings
        </TabsTrigger>
        <TabsTrigger value="trades" className={TRIGGER_CLASS}>
          Trades
        </TabsTrigger>
        <TabsTrigger value="securities" className={TRIGGER_CLASS}>
          Securities
        </TabsTrigger>
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
  );
}
