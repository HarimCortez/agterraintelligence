"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dataQualityPropertyQueryKey,
  fetchDataQualityProperty,
  verifyDataQualityProperty,
} from "@/lib/admin-data-quality-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatCurrencyFromCents, formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

// investor-web hosts the real Property Intelligence Page (map, full risk
// flags, AI analyst) — admin-web has no Mapbox integration of its own, so
// this links out to the real thing rather than building a second map.
const INVESTOR_WEB_URL = "https://www.agterraintelligence.com";

export function DataQualityPropertyDetail({ propertyId }: { propertyId: string }) {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: dataQualityPropertyQueryKey(propertyId),
    queryFn: () => fetchDataQualityProperty(propertyId),
  });

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  const verifyMutation = useMutation({
    mutationFn: () => verifyDataQualityProperty(propertyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataQualityPropertyQueryKey(propertyId) }),
    onError: handleUnauthorized,
  });

  if (query.isError && query.error instanceof ForbiddenError) {
    return (
      <div className="p-xl">
        <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
          {query.error.message}
        </div>
      </div>
    );
  }

  const property = query.data;

  return (
    <div className="p-xl">
      <Link href="/data-quality" className="mb-lg inline-block text-sm text-action-primary underline">
        ← Back to Content &amp; Data Quality
      </Link>

      {query.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
      {query.isError && !(query.error instanceof ForbiddenError) && (
        <p className="text-sm text-text-secondary">
          {query.error instanceof Error ? query.error.message : "Couldn't load this property."}
        </p>
      )}

      {property && (
        <div className="grid grid-cols-1 gap-lg lg:grid-cols-[2fr_1fr]">
          <div>
            <header className="mb-lg">
              <h1 className="text-2xl font-semibold text-text-primary">{property.address}</h1>
              <p className="text-sm text-text-secondary">
                {property.county} County · {property.acreage} ac · {formatEnumLabel(property.landUseType)}
              </p>
              <a
                href={`${INVESTOR_WEB_URL}/properties/${property.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-xs inline-block text-sm text-action-primary underline"
              >
                View Property Intelligence Page (map, full AI analyst) ↗
              </a>
            </header>

            <div className="mb-lg grid grid-cols-2 gap-md sm:grid-cols-3">
              <Stat label="Opportunity score" value={property.opportunityScore != null ? String(property.opportunityScore) : "Missing"} />
              <Stat label="Band" value={property.opportunityBand ? formatEnumLabel(property.opportunityBand) : "—"} />
              <Stat
                label="Asking price"
                value={formatCurrencyFromCents(property.askingPriceCents)}
              />
              <Stat
                label="Estimated value"
                value={property.estimatedValueCents != null ? formatCurrencyFromCents(property.estimatedValueCents) : "Missing"}
              />
              <Stat label="Discount vs. estimate" value={property.discountPct != null ? `${property.discountPct}%` : "—"} />
              <Stat label="Confidence" value={property.confidence ? formatEnumLabel(property.confidence) : "No valuation"} />
            </div>

            <section className="mb-lg">
              <h2 className="mb-sm text-lg font-semibold text-text-primary">Risk flags ({property.riskFlags.length})</h2>
              {property.riskFlags.length === 0 ? (
                <p className="text-sm text-text-secondary">No risk flags on this property.</p>
              ) : (
                <div className="flex flex-col gap-sm">
                  {property.riskFlags.map((flag) => (
                    <div key={flag.id} className="rounded border border-border-subtle bg-surface p-md">
                      <p className="text-sm font-semibold text-text-primary">
                        {formatEnumLabel(flag.riskType)} · {formatEnumLabel(flag.severity)} severity
                      </p>
                      <p className="mt-xs text-sm text-text-secondary">{flag.description}</p>
                      <p className="mt-xs text-xs text-text-secondary">{formatDate(flag.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-sm text-lg font-semibold text-text-primary">
                AI interaction history ({property.aiInteractions.length})
              </h2>
              {property.aiInteractions.length === 0 ? (
                <p className="text-sm text-text-secondary">No AI analyst activity recorded for this property yet.</p>
              ) : (
                <div className="flex flex-col gap-sm">
                  {property.aiInteractions.map((interaction) => (
                    <div key={interaction.id} className="rounded border border-border-subtle bg-surface p-md">
                      <p className="text-sm text-text-primary">{interaction.question ?? "Default investment thesis"}</p>
                      <p className="mt-xs text-xs text-text-secondary">
                        {interaction.modelVersion} · {formatDate(interaction.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-md">
            <div className="rounded border border-border-subtle bg-surface p-lg">
              <h2 className="mb-sm text-sm font-semibold text-text-primary">Data issues</h2>
              {property.issues.length === 0 ? (
                <p className="text-sm text-text-secondary">No issues detected.</p>
              ) : (
                <ul className="list-disc pl-md text-sm text-text-secondary">
                  {property.issues.map((issue) => (
                    <li key={issue}>{formatEnumLabel(issue)}</li>
                  ))}
                </ul>
              )}
            </div>

            {property.duplicateCandidates.length > 0 && (
              <div className="rounded border border-border-subtle bg-surface p-lg">
                <h2 className="mb-sm text-sm font-semibold text-text-primary">Possible duplicates</h2>
                <div className="flex flex-col gap-xs">
                  {property.duplicateCandidates.map((dup) => (
                    <Link key={dup.id} href={`/data-quality/${dup.id}`} className="text-sm text-action-primary underline">
                      {dup.address} ({dup.county} County)
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded border border-border-subtle bg-surface p-lg">
              <h2 className="mb-sm text-sm font-semibold text-text-primary">Review</h2>
              {property.confidence === "verified" ? (
                <p className="text-sm text-text-secondary">Already verified.</p>
              ) : !property.estimatedValueCents ? (
                <p className="text-sm text-text-secondary">No valuation exists to verify.</p>
              ) : (
                <button
                  type="button"
                  disabled={verifyMutation.isPending}
                  onClick={() => verifyMutation.mutate()}
                  className="rounded border border-border-default px-sm py-xs text-xs font-semibold text-text-primary hover:bg-workspace-bg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyMutation.isPending ? "Verifying…" : "Mark as verified"}
                </button>
              )}
              {verifyMutation.isError && !(verifyMutation.error instanceof ForbiddenError) && (
                <p className="mt-xs text-xs text-text-secondary">
                  {verifyMutation.error instanceof Error ? verifyMutation.error.message : "Failed to verify."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border-subtle bg-surface p-md">
      <p className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">{label}</p>
      <p className="mt-xs text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}
