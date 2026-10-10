/**
 * Declarative, per-site policy of the Cloudflare challenge path.
 *
 * Every decision the challenge handling takes about ONE site is described here, in ONE table, and
 * read through ONE lookup — instead of the four independent registries the behaviour used to be
 * spread over (`AddStalledChallengeReload`, `AddForkChallengeHandling`, `AddClearanceReload` and the
 * `requireSolveToken` gate, each with its own predicate). The repeated failures documented in
 * `MEMORY.md` (addenda 18, 20, 23, 25, 26, 27) were all *collisions between several actors deciding
 * about the same document*; a single table cannot make two of them disagree about which reload is
 * allowed on a given host.
 *
 * A site which registered nothing keeps exactly the upstream behaviour: it is never rerouted to the
 * fork path and no reload may ever touch its challenge.
 */

/**
 * Everything that varies from one site to the next in the challenge path.
 *
 * An absent entry means "no site-specific policy": the fork challenge handling does not own the
 * site, so no window is classified, no budget is spent and no reload may fire.
 */
export interface ChallengePolicy {
    /** The hostname pattern this policy applies to (as registered by the site module). */
    readonly pattern: RegExp;
    /** The fork challenge handling owns this site's windows (classification, budgets, pollers). */
    readonly forkHandling: boolean;
    /** The age-driven stalled reload may restart a challenge document which renders no control. */
    readonly stalledReload: boolean;
    /** The clearance-driven restart may reload the SAME window after a fresh `cf_clearance`. */
    readonly clearanceReload: boolean;
    /**
     * Minimum time [ms] after the FIRST fresh clearance before the clearance reload may fire.
     * Some origins need longer for their server-side validation than the normal navigation grace.
     */
    readonly validationGrace?: number;
    /**
     * When `true`, a `cf_clearance` change only counts as a solve when the challenge document
     * carries a completed turnstile response (or the origin recorded a resolution moments ago).
     * Cloudflare rotates the cookie while RENDERING a challenge; that rotation must not arm the
     * bounded reload cycle. Sites whose widget lives in a subframe cannot read the response and
     * must therefore stay off this gate.
     */
    readonly requireSolveToken: boolean;
    /** Reloads the age-driven stalled poller may perform per window (Cloudflare managed stall). */
    readonly stalledReloadBudget: number;
}

/** The defaults every registered site gets unless it says otherwise. */
export const DEFAULT_CHALLENGE_POLICY: Omit<ChallengePolicy, 'pattern'> = {
    forkHandling: false,
    stalledReload: false,
    clearanceReload: false,
    validationGrace: undefined,
    requireSolveToken: false,
    stalledReloadBudget: 3,
};

const policies: ChallengePolicy[] = [];

/**
 * Register or update the policy of a site.
 *
 * Upsert semantics: a site which calls this twice (e.g. one line for the fork handling, another for
 * the clearance reload) keeps a SINGLE entry — the fields it does not mention keep their value, so
 * no second registration can silently reset what the first one declared. That is deliberate: the
 * reported class of bug is exactly a registration overwriting another one.
 * @param pattern - The hostname pattern of the site.
 * @param policy - The fields to declare; the others keep the {@link DEFAULT_CHALLENGE_POLICY} value.
 */
export function SetChallengePolicy(pattern: RegExp, policy: Partial<Omit<ChallengePolicy, 'pattern'>> = {}): ChallengePolicy {
    const existing = policies.find(entry => entry.pattern.source === pattern.source && entry.pattern.flags === pattern.flags);
    const merged: ChallengePolicy = {
        ...DEFAULT_CHALLENGE_POLICY,
        ...existing,
        ...policy,
        pattern: existing?.pattern ?? pattern,
    };
    if (existing) {
        Object.assign(existing, merged);
        return existing;
    }
    policies.push(merged);
    return merged;
}

/**
 * The policy in force for the given URL, or `undefined` when no site declared one (upstream
 * behaviour: the request is never rerouted and no challenge window budget applies).
 *
 * Several entries may match one URL (e.g. a generic and a more specific hostname). The result is the
 * union of the matched entries — a flag declared by any of them is on — while every scalar takes the
 * value of the FIRST matching entry which declares it, so the outcome only depends on the
 * registration order and never on which lookup happened to run.
 */
export function FindChallengePolicy(url: string): ChallengePolicy | undefined {
    const matches = policies.filter(policy => policy.pattern.test(url));
    if (matches.length === 0) return undefined;
    const merged: Record<string, unknown> = { ...DEFAULT_CHALLENGE_POLICY };
    // Reversed: walking from the last to the first match lets the FIRST one win every scalar.
    for (const policy of [...matches].reverse()) {
        for (const [ key, value ] of Object.entries(policy)) {
            if (key === 'pattern' || value === undefined) continue;
            merged[key] = typeof value === 'boolean' ? merged[key] === true || value === true : value;
        }
    }
    merged.pattern = matches[0].pattern;
    return merged as unknown as ChallengePolicy;
}

/**
 * Every registered policy, for tests and diagnostics which must guard "this site did not declare
 * that behaviour" instead of asserting against a copy that can drift from the real registration.
 */
export function GetChallengePolicies(): readonly ChallengePolicy[] {
    return policies;
}

/**
 * Forget every registration. Tests only: the registration is a module-level side effect of importing
 * a site module, so a suite which checks the absence of a policy needs a way back to a blank table.
 */
export function ResetChallengePolicies(): void {
    policies.length = 0;
}
