import type { RequestContext } from './request-context';

export interface ContextInput {
  tenantSlug: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * The auth seam (ARCHITECTURE §3, ADR 0007). Phase 1 uses DevHeaderContextProvider; Phase 2
 * swaps in a JWT provider behind this same interface, and nothing else changes.
 */
export interface RequestContextProvider {
  resolve(input: ContextInput): Promise<RequestContext>;
}

export const REQUEST_CONTEXT_PROVIDER = Symbol('REQUEST_CONTEXT_PROVIDER');
