import { useEffect, useMemo, useState, type FormEvent } from "react";
import { platformScope } from "@comvestec/contracts";
import { Button } from "@comvestec/ui";
import {
  buildAdminTenantTargetOptions,
  type AdminTenantTargetOption,
} from "../lib/admin-tenant-target-options";
import { loadAdminTenantsDirectoryLoaderData } from "../lib/tenants-directory-loader";
import {
  adminTenantTargetScopes,
  sanitizeAdminTenantTargetScope,
  type AdminTenantTarget,
  type AdminTenantTargetScope,
} from "../lib/admin-tenant-target";

type AdminTenantTargetFormProps = {
  readonly initialScope?: string | undefined;
  readonly initialScopeId?: string | undefined;
  readonly allowedScopes?: readonly AdminTenantTargetScope[] | undefined;
  readonly allowExactScopeLookup?: boolean;
  readonly scopeLabel?: string;
  readonly scopeIdLabel?: string;
  readonly scopeIdPlaceholder?: string;
  readonly submitLabel: string;
  readonly submitVariant?: "primary" | "secondary";
  readonly targetOptions?: readonly AdminTenantTargetOption[] | undefined;
  readonly onSubmit: (target: AdminTenantTarget) => void;
};

export function AdminTenantTargetForm({
  initialScope,
  initialScopeId,
  allowedScopes,
  allowExactScopeLookup = false,
  scopeLabel = "Scope",
  scopeIdLabel = "Internal scope ID",
  scopeIdPlaceholder = "Enter exact internal scope ID…",
  submitLabel,
  submitVariant = "primary",
  targetOptions,
  onSubmit,
}: Readonly<AdminTenantTargetFormProps>) {
  const enabledScopes =
    allowedScopes === undefined || allowedScopes.length === 0
      ? adminTenantTargetScopes
      : allowedScopes;
  const enabledScopesKey = enabledScopes.join("|");
  const resolveFormScope = (value: unknown): AdminTenantTargetScope => {
    const scope = sanitizeAdminTenantTargetScope(value);
    const defaultScope = enabledScopes[0] ?? platformScope.organization;

    return scope !== undefined && enabledScopes.includes(scope)
      ? scope
      : defaultScope;
  };

  const [manualScope, setManualScope] = useState<AdminTenantTargetScope>(
    resolveFormScope(initialScope),
  );
  const [manualScopeId, setManualScopeId] = useState(initialScopeId ?? "");
  const [query, setQuery] = useState(initialScopeId ?? "");
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(
    null,
  );
  const [loadedOptions, setLoadedOptions] = useState<
    readonly AdminTenantTargetOption[]
  >(targetOptions ?? []);
  const [targetStatus, setTargetStatus] = useState<
    "loading" | "ready" | "unavailable"
  >(targetOptions === undefined ? "loading" : "ready");

  useEffect(() => {
    let cancelled = false;

    if (targetOptions !== undefined) {
      setLoadedOptions(targetOptions);
      setTargetStatus("ready");
      return;
    }

    setTargetStatus("loading");
    void loadAdminTenantsDirectoryLoaderData()
      .then((data) => {
        if (cancelled) {
          return;
        }

        if (data.kind !== "ready") {
          setLoadedOptions([]);
          setTargetStatus("unavailable");
          return;
        }

        setLoadedOptions(buildAdminTenantTargetOptions(data.rows));
        setTargetStatus("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setLoadedOptions([]);
        setTargetStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [targetOptions]);

  const availableOptions = useMemo(
    () =>
      (targetOptions ?? loadedOptions).filter((option) =>
        enabledScopes.includes(option.target.scope),
      ),
    [enabledScopes, loadedOptions, targetOptions],
  );

  useEffect(() => {
    const nextScope = resolveFormScope(initialScope);
    const nextScopeId = initialScopeId ?? "";
    const matchingOption =
      nextScopeId.length === 0
        ? undefined
        : availableOptions.find(
            (option) =>
              option.target.scope === nextScope &&
              option.target.scopeId === nextScopeId,
          );

    setManualScope(nextScope);
    setManualScopeId(nextScopeId);
    setSelectedOptionKey(matchingOption?.key ?? null);
    setQuery(matchingOption?.label ?? nextScopeId);
  }, [availableOptions, enabledScopesKey, initialScope, initialScopeId]);

  const selectedOption =
    selectedOptionKey === null
      ? undefined
      : availableOptions.find((option) => option.key === selectedOptionKey);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions =
    normalizedQuery.length === 0
      ? availableOptions
      : availableOptions.filter((option) =>
          option.searchText.includes(normalizedQuery),
        );
  const inferredOption =
    selectedOption ??
    (normalizedQuery.length > 0 && filteredOptions.length === 1
      ? filteredOptions[0]
      : undefined);

  const selectTarget = (option: AdminTenantTargetOption) => {
    setSelectedOptionKey(option.key);
    setQuery(option.label);
    setManualScope(option.target.scope);
    setManualScopeId(option.target.scopeId);
  };

  const submitTarget = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inferredOption !== undefined) {
      onSubmit(inferredOption.target);
      return;
    }

    if (!allowExactScopeLookup) {
      return;
    }

    const trimmedScopeId = manualScopeId.trim();

    if (trimmedScopeId.length === 0) {
      return;
    }

    onSubmit({
      scope: manualScope,
      scopeId: trimmedScopeId,
    });
  };

  return (
    <form className="ops-target-form" onSubmit={submitTarget}>
      <div className="ops-target-form-stack">
        <section className="ops-target-picker">
          <div className="ops-target-picker-head">
            <div>
              <p className="ops-card-title">Tenant target</p>
              <h3 className="ops-target-picker-title">
                {selectedOption?.label ?? "Search and pick a tenant"}
              </h3>
            </div>
            <p className="ops-target-picker-caption">
              {selectedOption?.description ??
                (allowExactScopeLookup
                  ? "Start from tenant names and operator context first. Exact scope IDs stay behind explicit operator disclosure."
                  : "Start from tenant names and operator context first. Search the shared operator catalog before loading a tenant view.")}
            </p>
          </div>

          <label className="ops-field">
            <span className="ops-field-label">Tenant target</span>
            <input
              className="ops-field-input"
              type="text"
              value={query}
              onChange={(event) => {
                const nextQuery = event.currentTarget.value;
                setQuery(nextQuery);

                if (
                  selectedOption !== undefined &&
                  nextQuery.trim() !== selectedOption.label
                ) {
                  setSelectedOptionKey(null);
                  setManualScope(resolveFormScope(initialScope));
                  setManualScopeId("");
                }
              }}
              placeholder="Search tenants by name, scope, or id…"
              autoComplete="off"
            />
          </label>

          <div className="ops-target-picker-list" role="list">
            {targetStatus === "loading" ? (
              <div className="ops-target-picker-empty" role="listitem">
                Loading recent operator targets…
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="ops-target-picker-empty" role="listitem">
                {allowExactScopeLookup
                  ? "No tenant targets matched the current search. Clear the search or use exact lookup only for governed operator recovery paths."
                  : "No tenant targets matched the current search. Clear the search or broaden the tenant query to stay on the shared operator catalog."}
              </div>
            ) : (
              filteredOptions.slice(0, 6).map((option) => {
                const isActive =
                  option.key === selectedOption?.key ||
                  option.key === inferredOption?.key;

                return (
                  <div key={option.key} role="listitem">
                    <button
                      type="button"
                      className={`ops-target-picker-option${isActive ? " ops-target-picker-option--active" : ""}`}
                      data-target-option={option.key}
                      aria-pressed={isActive}
                      onClick={() => selectTarget(option)}
                    >
                      <span className="ops-target-picker-option-label">
                        {option.label}
                      </span>
                      <span className="ops-target-picker-option-meta">
                        {option.description}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {allowExactScopeLookup ? (
          <details className="ops-target-manual">
            <summary className="ops-target-manual-summary">
              Use exact scope lookup
            </summary>

            <div className="ops-target-manual-grid">
              <label className="ops-field">
                <span className="ops-field-label">{scopeLabel}</span>
                <select
                  className="ops-field-input"
                  value={manualScope}
                  onChange={(event) => {
                    setSelectedOptionKey(null);
                    setQuery("");
                    setManualScope(resolveFormScope(event.currentTarget.value));
                  }}
                >
                  {enabledScopes.map((targetScope) => (
                    <option key={targetScope} value={targetScope}>
                      {targetScope}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ops-field ops-target-form-field">
                <span className="ops-field-label">{scopeIdLabel}</span>
                <input
                  className="ops-field-input"
                  type="text"
                  value={manualScopeId}
                  onChange={(event) => {
                    setSelectedOptionKey(null);
                    setQuery("");
                    setManualScopeId(event.currentTarget.value);
                  }}
                  placeholder={scopeIdPlaceholder}
                  autoComplete="off"
                />
              </label>
            </div>
          </details>
        ) : null}

        <div className="ops-target-form-submit">
          <Button
            type="submit"
            variant={submitVariant}
            disabled={
              inferredOption === undefined &&
              (!allowExactScopeLookup || manualScopeId.trim().length === 0)
            }
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
