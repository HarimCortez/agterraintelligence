"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { AiAnalysisResult } from "@agterra/ui";
import {
  AI_QUESTION_MAX_LENGTH,
  AiAnalysisRateLimitedError,
  AiAnalysisUnavailableError,
  askAiAboutProperty,
} from "@/lib/ai-analysis-api";

interface AiAnalystPanelProps {
  propertyId: string;
}

/**
 * AI Analyst panel — Property Intelligence Page's entry point into the
 * shared structured-AI-response renderer (`AiAnalysisResult` in
 * `@agterra/ui`). Two triggers share one `useMutation` (POST with real side
 * effects — a billed Anthropic call plus an `ai_interactions` row on
 * success — so this is deliberately a mutation, not a `useQuery`):
 *
 * - "Generate AI Analysis" — calls with no `question`; the server defaults
 *   to its investment-thesis question (`AiAnalysisService.DEFAULT_QUESTION`).
 * - The follow-up question form — calls with an explicit `{ question }`.
 *
 * `mutation.variables` (rather than separate local state) distinguishes
 * which trigger is in flight/was last used, since TanStack Query already
 * tracks it.
 *
 * Error handling distinguishes the three cases this endpoint can actually
 * produce (see `ai-analysis-api.ts` and `AiAnalysisService`'s documented
 * failure modes) — this is what you'll actually observe live right now,
 * since no `ANTHROPIC_API_KEY` is configured yet:
 * - 503 → calm "temporarily unavailable" state, `role="status"` (an
 *   expected/known current condition, not a crash).
 * - 429 → distinct "rate limited, try again later" state, `role="status"`.
 * - anything else → generic retry-able error, `role="alert"`, matching
 *   `PropertyDetailView`'s top-level `ErrorState` pattern.
 */
export function AiAnalystPanel({ propertyId }: AiAnalystPanelProps) {
  const [question, setQuestion] = useState("");

  const mutation = useMutation({
    mutationFn: (q?: string) => askAiAboutProperty(propertyId, q),
  });

  const isGeneratePending = mutation.isPending && mutation.variables === undefined;
  const isAskPending = mutation.isPending && mutation.variables !== undefined;

  const handleGenerate = () => {
    mutation.mutate(undefined);
  };

  const handleAsk = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length === 0) return;
    mutation.mutate(trimmed);
  };

  return (
    <section aria-label="AI Analyst" className="rounded border border-border-subtle bg-surface p-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">AI Analyst</h2>
          <p className="mt-xs max-w-prose text-sm text-text-secondary">
            Generate an AI-assisted read on this property&apos;s investment case, or ask a specific
            question. This is AI-generated and does not replace professional due diligence.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={mutation.isPending}
          className="shrink-0 rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratePending ? "Generating…" : "Generate AI Analysis"}
        </button>
      </div>

      <form onSubmit={handleAsk} className="mt-md flex flex-col gap-sm sm:flex-row">
        <label htmlFor="ai-analyst-question" className="sr-only">
          Ask the AI Analyst a question about this property
        </label>
        <input
          id="ai-analyst-question"
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={AI_QUESTION_MAX_LENGTH}
          placeholder="Ask a follow-up question about this property…"
          className="flex-1 rounded border border-border-default bg-surface px-md py-sm text-sm text-text-primary placeholder:text-text-secondary focus:border-action-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={mutation.isPending || question.trim().length === 0}
          className="shrink-0 rounded border border-action-primary px-md py-sm text-sm font-semibold text-action-primary hover:bg-workspace-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAskPending ? "Asking…" : "Ask"}
        </button>
      </form>

      <div className="mt-lg">
        {mutation.isIdle && <IdleState />}
        {mutation.isPending && <LoadingState />}
        {mutation.isError && (
          <ErrorState error={mutation.error} onRetry={() => mutation.mutate(mutation.variables)} />
        )}
        {mutation.isSuccess && (
          <div className="flex flex-col gap-sm">
            {mutation.data.question && (
              <p className="text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">Question: </span>
                {mutation.data.question}
              </p>
            )}
            <AiAnalysisResult result={mutation.data} />
          </div>
        )}
      </div>
    </section>
  );
}

function IdleState() {
  return (
    <p className="text-sm text-text-secondary">
      No analysis generated yet. Click &ldquo;Generate AI Analysis&rdquo; for a default
      investment-thesis read, or ask a specific question above.
    </p>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-sm text-sm text-text-secondary">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-action-primary"
      />
      <span>Analyzing property… this can take a few seconds.</span>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof AiAnalysisUnavailableError) {
    return (
      <div
        role="status"
        className="rounded border border-border-subtle bg-workspace-bg p-md text-sm text-text-secondary"
      >
        <p className="font-semibold text-text-primary">AI Analyst is temporarily unavailable</p>
        <p className="mt-xs">
          This feature isn&apos;t fully live yet. The rest of this property&apos;s data above is
          unaffected — check back soon.
        </p>
      </div>
    );
  }

  if (error instanceof AiAnalysisRateLimitedError) {
    return (
      <div
        role="status"
        className="rounded border border-border-subtle bg-workspace-bg p-md text-sm text-text-secondary"
      >
        <p className="font-semibold text-text-primary">Request limit reached</p>
        <p className="mt-xs">You&apos;ve reached the AI request limit — try again in a few minutes.</p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-md text-sm text-text-primary"
    >
      <p className="font-semibold">Something went wrong</p>
      <p className="text-text-secondary">
        {error instanceof Error ? error.message : "The AI Analyst request failed. Please try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
