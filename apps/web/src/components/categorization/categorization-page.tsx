import { listCategoriesOptions } from "@bessel/client";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@bessel/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { PageHeader, SoftButton } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { CategoriesTab } from "./categories-tab";
import { RulesTab } from "./rules-tab";

const TRIGGER_CLASS =
  "h-full flex-none rounded-md border-0 px-3 text-12 font-medium text-white/50 transition-colors duration-150 hover:text-white/80 dark:text-white/50 dark:hover:text-white/80 data-[state=active]:bg-white/10 data-[state=active]:text-white/90 dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white/90 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none";

export type CategorizationTab = "rules" | "categories";

/** Rules and categories, opened from the transactions page. */
export function CategorizationPage({
  onBack,
  initialTab = "rules",
}: {
  onBack: () => void;
  initialTab?: CategorizationTab;
}) {
  const [tab, setTab] = useState<CategorizationTab>(initialTab);
  const { data, isLoading } = useQuery(
    listCategoriesOptions({ client, query: { limit: 200 } }),
  );
  const categories = data?.items ?? [];

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as CategorizationTab)}
      className="@container flex flex-col gap-4"
    >
      <PageHeader
        title="Rules and categories"
        summary={
          tab === "rules"
            ? "Rules sort imports by their bank text; a category you chose yourself always wins."
            : "Your categories, by group."
        }
      >
        <SoftButton onClick={onBack}>
          <ChevronLeft />
          Transactions
        </SoftButton>
      </PageHeader>
      <TabsList className="h-8 rounded-lg border border-white/[0.07] bg-white/[0.04] p-0.5 group-data-[orientation=horizontal]/tabs:h-8">
        <TabsTrigger value="rules" className={TRIGGER_CLASS}>
          Rules
        </TabsTrigger>
        <TabsTrigger value="categories" className={TRIGGER_CLASS}>
          Categories
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rules">
        <RulesTab categories={categories} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesTab categories={categories} isLoading={isLoading} />
      </TabsContent>
    </Tabs>
  );
}
