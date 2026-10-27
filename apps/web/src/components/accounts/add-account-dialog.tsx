import type {
  AvanzaAccountSchema,
  BankAccountSchema,
  BankConnectionAccountSchema,
  MontroseAccountSchema,
} from "@bessel/client";
import {
  createBankAccountMutation,
  getAccountsOverviewQueryKey,
  getAvanzaOptions,
  getAvanzaQueryKey,
  getMontroseOptions,
  getMontroseQueryKey,
  getNetWorthHistoryQueryKey,
  linkAvanzaAccountMutation,
  linkBankConnectionAccountMutation,
  linkMontroseAccountMutation,
  listBankAccountsOptions,
  listBankAccountsQueryKey,
  listBankConnectionsOptions,
  listBankConnectionsQueryKey,
} from "@bessel/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { Input } from "@bessel/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@bessel/ui/components/native-select";
import { Switch } from "@bessel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Fingerprint,
  Lock,
  PenLine,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useAccountActions } from "@/components/accounts/account-actions";
import { BankLogo } from "@/components/bank-logo";
import { FILE_BANKS } from "@/components/import-dialog";
import { PrimaryButton, SoftButton } from "@/components/ui-kit";
import { errorDetail } from "@/lib/api-error";
import { avanzaErrorMessage, syncAvanzaFromDesktop } from "@/lib/avanza-sync";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

interface Provider {
  name: string;
  logo: string | null;
  kind: "bank" | "avanza" | "montrose" | "klarna";
  hint: string;
}

export type AddStep =
  | { step: "choose" }
  | { step: "safety"; provider: Provider }
  | { step: "details"; via: "upload" | "manual" | "klarna" }
  | { step: "pick"; source: "bank"; bankName: string }
  | { step: "pick"; source: "avanza" }
  | { step: "pick"; source: "montrose" };

const KLARNA_LOGO = "https://enablebanking.com/brands/SE/Klarna/";

const KINDS = [
  { subtype: "checking", label: "Everyday" },
  { subtype: "savings", label: "Savings" },
  { subtype: "isk", label: "Investments" },
  { subtype: "credit_card", label: "Pay later or card" },
] as const;

const AVANZA_SUBTYPES: Record<string, string> = {
  INVESTERINGSSPARKONTO: "isk",
  KAPITALFORSAKRING: "kf",
  AKTIEFONDKONTO: "af",
  SPARKONTO: "savings",
};

const MONTROSE_SUBTYPES: Record<string, string> = {
  ISK: "isk",
  KF: "kf",
  Depot: "brokerage",
  SPAR: "savings",
  Credit: "loan",
};

function useProviders(): { providers: Provider[]; banksClosed: boolean } {
  const { data: banks } = useQuery(listBankConnectionsOptions({ client }));
  const { data: avanza } = useQuery(getAvanzaOptions({ client }));
  const { data: montrose } = useQuery(getMontroseOptions({ client }));
  const providers: Provider[] = [];
  if (banks?.available) {
    for (const bank of banks.bank_options) {
      providers.push({
        name: bank.name,
        logo: bank.logo,
        kind: "bank",
        hint: "Approve with BankID",
      });
    }
  }
  if (avanza?.available && !avanza.connection) {
    providers.push({
      name: "Avanza",
      logo: null,
      kind: "avanza",
      hint: "Stocks and funds",
    });
  }
  if (montrose && !montrose.connection) {
    providers.push({
      name: "Montrose",
      logo: montrose.logo,
      kind: "montrose",
      hint: "Approve with BankID",
    });
  }
  providers.push({
    name: "Klarna pay later",
    logo: KLARNA_LOGO,
    kind: "klarna",
    hint: "Purchases you pay later",
  });
  return { providers, banksClosed: banks?.available === false };
}

/** One place to add any account: pick the bank, see what Bessel can and can't do, approve, choose accounts. */
export function AddAccountDialog({
  state,
  onStateChange,
}: {
  state: AddStep | null;
  onStateChange: (state: AddStep | null) => void;
}) {
  const close = () => onStateChange(null);
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        {state?.step === "choose" && <Choose onNext={onStateChange} />}
        {state?.step === "safety" && (
          <Safety
            provider={state.provider}
            onBack={() => onStateChange({ step: "choose" })}
            onClose={close}
          />
        )}
        {state?.step === "details" && (
          <Details
            via={state.via}
            onBack={() => onStateChange({ step: "choose" })}
            onClose={close}
          />
        )}
        {state?.step === "pick" && <Pick state={state} onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}

function Header({
  title,
  description,
  onBack,
}: {
  title: string;
  description?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="px-6 pt-6 pb-4">
      {onBack && <BackButton onClick={onBack} className="mb-3" />}
      <DialogTitle className="type-title text-white">{title}</DialogTitle>
      {description && (
        <DialogDescription className="mt-1 text-13 text-white/55">
          {description}
        </DialogDescription>
      )}
    </div>
  );
}

function BackButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 type-caption text-white/50 transition-colors hover:text-white/80",
        className,
      )}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Back
    </button>
  );
}

function Choose({ onNext }: { onNext: (state: AddStep) => void }) {
  const { providers, banksClosed } = useProviders();
  const [query, setQuery] = useState("");
  const shown = providers.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <Header
        title="Add an account"
        description="Pick your bank. Bessel only ever reads - it can't move money."
      />
      <div className="px-6">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/35"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search banks"
            aria-label="Search banks"
            className="h-10 pl-9 text-13"
          />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((provider) => (
            <li key={provider.name}>
              <button
                type="button"
                onClick={() =>
                  onNext(
                    provider.kind === "klarna"
                      ? { step: "details", via: "klarna" }
                      : { step: "safety", provider },
                  )
                }
                className="flex h-full w-full flex-col items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-4 text-center transition-colors duration-150 hover:border-white/15 hover:bg-white/[0.06] focus-visible:border-white/25 focus-visible:outline-none"
              >
                <BankLogo name={provider.name} logo={provider.logo} size="lg" />
                <span className="text-13 font-medium text-white/85">
                  {provider.name}
                </span>
                <span className="type-caption text-white/40">
                  {provider.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="py-6 text-center text-13 text-white/45">
            No bank called "{query}" yet. Upload a file from it instead.
          </p>
        )}
        {banksClosed && (
          <p className="mt-3 type-caption text-white/45">
            Direct bank connections aren't open to everyone yet. You can upload
            a file from your bank below.
          </p>
        )}
      </div>
      <div className="mt-5 border-t border-white/[0.06] px-6 py-4">
        <p className="mb-2 type-caption text-white/45">
          Bank not here, or rather not connect?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SoftButton
            size="default"
            onClick={() => onNext({ step: "details", via: "upload" })}
          >
            <Upload aria-hidden />
            Upload a file
          </SoftButton>
          <SoftButton
            size="default"
            onClick={() => onNext({ step: "details", via: "manual" })}
          >
            <PenLine aria-hidden />
            Add by hand
          </SoftButton>
        </div>
      </div>
    </>
  );
}

function Assurance({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300 [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="text-13 text-white/75">{children}</span>
    </li>
  );
}

function Safety({
  provider,
  onBack,
  onClose,
}: {
  provider: Provider;
  onBack: () => void;
  onClose: () => void;
}) {
  const { connectBank, connectAvanza, connectMontrose, busy } =
    useAccountActions();
  const avanza = provider.kind === "avanza";
  const montrose = provider.kind === "montrose";
  return (
    <>
      <div className="px-6 pt-6">
        <BackButton onClick={onBack} />
      </div>
      <div className="flex justify-center pt-2">
        <BankLogo name={provider.name} logo={provider.logo} size="lg" />
      </div>
      <Header
        title={`Connect ${provider.name}`}
        description={
          avanza
            ? "The desktop app signs in to Avanza from this computer and sends Bessel your accounts."
            : montrose
              ? "You log in with BankID at Montrose and approve that Bessel reads your accounts."
              : `You approve it at ${provider.name}. It takes about a minute.`
        }
      />
      <ul className="space-y-3 px-6">
        {avanza ? (
          <>
            <Assurance icon={<Lock />}>
              Your login stays in this computer's keychain. Bessel's servers
              never see it.
            </Assurance>
            <Assurance icon={<ShieldCheck />}>
              Bessel never places orders or moves money.
            </Assurance>
          </>
        ) : montrose ? (
          <>
            <Assurance icon={<ShieldCheck />}>
              Read-only: Bessel sees holdings and transactions. Montrose's
              connection can't move money or place orders.
            </Assurance>
            <Assurance icon={<Fingerprint />}>
              You approve with BankID at Montrose - Bessel never sees your
              login.
            </Assurance>
            <Assurance icon={<Lock />}>
              Access lasts 90 days, then you approve again. You can remove it
              any time, here or at Montrose.
            </Assurance>
          </>
        ) : (
          <>
            <Assurance icon={<ShieldCheck />}>
              Read-only: Bessel sees balances and transactions, and can never
              move your money.
            </Assurance>
            <Assurance icon={<Fingerprint />}>
              You approve with BankID at {provider.name} - Bessel never sees
              your password.
            </Assurance>
            <Assurance icon={<Lock />}>
              Access lasts about six months. You can remove it any time.
            </Assurance>
          </>
        )}
      </ul>
      <div className="px-6 pt-6 pb-6">
        <PrimaryButton
          className="w-full"
          disabled={busy}
          onClick={() => {
            if (avanza) {
              onClose();
              connectAvanza();
            } else if (montrose) {
              connectMontrose();
            } else {
              connectBank(provider.name);
            }
          }}
        >
          {avanza ? "Continue" : `Continue to ${provider.name}`}
        </PrimaryButton>
      </div>
    </>
  );
}

function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      getAccountsOverviewQueryKey({ client }),
      getNetWorthHistoryQueryKey({ client }),
      listBankAccountsQueryKey({ client }),
      listBankConnectionsQueryKey({ client }),
      getAvanzaQueryKey({ client }),
      getMontroseQueryKey({ client }),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

function Details({
  via,
  onBack,
  onClose,
}: {
  via: "upload" | "manual" | "klarna";
  onBack: () => void;
  onClose: () => void;
}) {
  const { upload } = useAccountActions();
  const invalidate = useInvalidateAccounts();
  const [name, setName] = useState(via === "klarna" ? "Klarna" : "");
  const [subtype, setSubtype] = useState<string>(
    via === "klarna" ? "credit_card" : "checking",
  );
  const [bank, setBank] = useState<string>(FILE_BANKS[0].value);
  const [balance, setBalance] = useState("");
  const [company, setCompany] = useState(false);
  const create = useMutation({
    ...createBankAccountMutation({ client }),
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't add the account")),
  });
  const submit = async () => {
    const account = await create.mutateAsync({
      client,
      body: {
        name: name.trim(),
        currency: "SEK",
        subtype,
        is_business: company,
        base_balance:
          via === "manual"
            ? Math.round(Number(balance.replace(",", ".") || 0) * 100)
            : 0,
      },
    });
    invalidate();
    onClose();
    if (via === "upload") upload({ source: bank, bankAccountId: account.id });
    else if (via === "klarna") {
      upload({ source: "klarna", bankAccountId: account.id });
    } else toast.success(`${account.name} added`);
  };
  const title =
    via === "klarna"
      ? "Add Klarna pay later"
      : via === "upload"
        ? "Upload a file"
        : "Add by hand";
  const description =
    via === "klarna"
      ? "Bring in what you've bought with Klarna and still pay for."
      : via === "upload"
        ? "Name the account, then upload the transactions you downloaded from your bank."
        : "For an account Bessel can't read. You keep its balance up to date yourself.";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Header title={title} description={description} onBack={onBack} />
      <div className="space-y-4 px-6">
        <Field label="Name">
          <Input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Like Savings or Everyday"
            className="h-10 text-13"
          />
        </Field>
        {via !== "klarna" && (
          <Field label="What it's for">
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((kind) => (
                <button
                  key={kind.subtype}
                  type="button"
                  aria-pressed={subtype === kind.subtype}
                  onClick={() => setSubtype(kind.subtype)}
                  className={cn(
                    "h-10 rounded-lg border text-13 transition-colors duration-150",
                    subtype === kind.subtype
                      ? "border-primary-400/60 bg-primary-500/15 text-white"
                      : "border-white/[0.08] bg-white/[0.03] text-white/65 hover:bg-white/[0.06]",
                  )}
                >
                  {kind.label}
                </button>
              ))}
            </div>
          </Field>
        )}
        {via === "upload" && (
          <Field label="Bank">
            <NativeSelect
              value={bank}
              onChange={(event) => setBank(event.target.value)}
              className="h-10 text-13"
              aria-label="Bank"
            >
              {FILE_BANKS.map((b) => (
                <NativeSelectOption key={b.value} value={b.value}>
                  {b.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        {via === "manual" && (
          <Field label="Balance today, in kr">
            <Input
              inputMode="decimal"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              placeholder="0"
              className="h-10 text-13"
            />
          </Field>
        )}
        {via !== "klarna" && (
          <div className="flex items-center justify-between gap-3 py-1">
            <span>
              <span className="block text-13 text-white/80">
                It's my company's
              </span>
              <span className="type-caption text-white/40">
                Kept apart from your own money.
              </span>
            </span>
            <Switch
              checked={company}
              onCheckedChange={setCompany}
              aria-label="It's my company's"
            />
          </div>
        )}
      </div>
      <div className="px-6 pt-6 pb-6">
        <PrimaryButton
          type="submit"
          className="w-full"
          disabled={!name.trim() || create.isPending}
        >
          {create.isPending
            ? "Adding…"
            : via === "manual"
              ? "Add account"
              : "Continue"}
        </PrimaryButton>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="type-label text-white/60">{label}</p>
      {children}
    </div>
  );
}

const NEW = "new";
const SKIP = "skip";

interface Candidate {
  id: string;
  name: string;
  detail: string | null;
  currency: string;
  subtype: string;
}

function bankCandidate(
  account: BankConnectionAccountSchema,
  bankName: string,
): Candidate {
  return {
    id: account.id,
    name: account.name ?? bankName,
    detail: account.iban ? `Ending ${account.iban.slice(-4)}` : null,
    currency: account.currency,
    subtype: "checking",
  };
}

function avanzaCandidate(account: AvanzaAccountSchema): Candidate {
  return {
    id: account.id,
    name: account.name,
    detail: null,
    currency: "SEK",
    subtype: AVANZA_SUBTYPES[account.account_type] ?? "brokerage",
  };
}

function montroseCandidate(account: MontroseAccountSchema): Candidate {
  return {
    id: account.id,
    name: account.name,
    detail: account.account_number,
    currency: "SEK",
    subtype: MONTROSE_SUBTYPES[account.account_type] ?? "brokerage",
  };
}

/** After approving: which of the bank's accounts to bring in, as new accounts or into ones already in Bessel. */
function Pick({
  state,
  onClose,
}: {
  state: Extract<AddStep, { step: "pick" }>;
  onClose: () => void;
}) {
  const invalidate = useInvalidateAccounts();
  const { data: banks } = useQuery(listBankConnectionsOptions({ client }));
  const { data: avanza } = useQuery(getAvanzaOptions({ client }));
  const { data: montrose } = useQuery(getMontroseOptions({ client }));
  const { data: existing } = useQuery(
    listBankAccountsOptions({
      client,
      query: { limit: 100, page: 1, sorting: ["name"] },
    }),
  );
  const name =
    state.source === "bank"
      ? state.bankName
      : state.source === "montrose"
        ? "Montrose"
        : "Avanza";
  const candidates: Candidate[] =
    state.source === "bank"
      ? (banks?.connections
          .find((c) => c.bank_name === state.bankName)
          ?.accounts.filter((a) => a.shared && !a.bank_account_id)
          .map((a) => bankCandidate(a, state.bankName)) ?? [])
      : state.source === "montrose"
        ? (montrose?.connection?.accounts
            .filter((a) => !a.bank_account_id)
            .map(montroseCandidate) ?? [])
        : (avanza?.connection?.accounts
            .filter((a) => !a.bank_account_id)
            .map(avanzaCandidate) ?? []);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const choice = (id: string) => choices[id] ?? NEW;
  const create = useMutation(createBankAccountMutation({ client }));
  const linkBank = useMutation(
    linkBankConnectionAccountMutation({
      client,
    }),
  );
  const linkAvanza = useMutation(linkAvanzaAccountMutation({ client }));
  const linkMontrose = useMutation(linkMontroseAccountMutation({ client }));
  const [saving, setSaving] = useState(false);
  const chosen = candidates.filter((c) => choice(c.id) !== SKIP);

  const save = async () => {
    setSaving(true);
    try {
      for (const candidate of chosen) {
        let target = choice(candidate.id);
        if (target === NEW) {
          const created = await create.mutateAsync({
            client,
            body: {
              name: candidate.name,
              currency: candidate.currency,
              subtype: candidate.subtype,
            },
          });
          target = created.id;
        }
        const link = {
          path: { account_id: candidate.id },
          body: { bank_account_id: target },
        };
        if (state.source === "bank") {
          await linkBank.mutateAsync({ client, ...link });
        } else if (state.source === "montrose") {
          await linkMontrose.mutateAsync({ client, ...link });
        } else {
          await linkAvanza.mutateAsync({ client, ...link });
        }
      }
      toast.success(
        `${chosen.length} account${chosen.length === 1 ? "" : "s"} added - importing now`,
      );
      if (state.source === "avanza" && chosen.length) {
        syncAvanzaFromDesktop()
          .then(invalidate)
          .catch((error) =>
            toast.error(
              avanzaErrorMessage(error, "Couldn't import from Avanza"),
            ),
          );
      }
      onClose();
    } catch (error) {
      toast.error(errorDetail(error, "Couldn't add the accounts"));
    } finally {
      setSaving(false);
      invalidate();
    }
  };

  return (
    <>
      <Header
        title={`${name} is connected`}
        description="Choose the accounts to bring into Bessel."
      />
      <ul className="space-y-2 px-6">
        {candidates.map((candidate) => (
          <PickRow
            key={candidate.id}
            candidate={candidate}
            value={choice(candidate.id)}
            existing={(existing?.items ?? []).filter(
              (a) => a.currency === candidate.currency,
            )}
            onChange={(value) =>
              setChoices((current) => ({ ...current, [candidate.id]: value }))
            }
          />
        ))}
        {candidates.length === 0 && (
          <p className="text-13 text-white/50">
            Every account from {name} is already in Bessel.
          </p>
        )}
      </ul>
      <div className="flex gap-2 px-6 pt-6 pb-6">
        <SoftButton size="default" className="flex-1" onClick={onClose}>
          Not now
        </SoftButton>
        <PrimaryButton
          className="flex-1"
          disabled={saving || chosen.length === 0}
          onClick={() => void save()}
        >
          {saving
            ? "Adding…"
            : `Add ${chosen.length} account${chosen.length === 1 ? "" : "s"}`}
        </PrimaryButton>
      </div>
    </>
  );
}

function PickRow({
  candidate,
  value,
  existing,
  onChange,
}: {
  candidate: Candidate;
  value: string;
  existing: BankAccountSchema[];
  onChange: (value: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 font-medium text-white/85">
          {candidate.name}
        </p>
        {candidate.detail && (
          <p className="type-caption text-white/40">{candidate.detail}</p>
        )}
      </div>
      <NativeSelect
        size="sm"
        className="w-44 text-12"
        aria-label={`What to do with ${candidate.name}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value={NEW}>Add as new</NativeSelectOption>
        {existing.map((account) => (
          <NativeSelectOption key={account.id} value={account.id}>
            Into {account.name}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={SKIP}>Skip</NativeSelectOption>
      </NativeSelect>
    </li>
  );
}
