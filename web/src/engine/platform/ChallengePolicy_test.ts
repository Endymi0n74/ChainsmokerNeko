import { describe, expect, it, afterEach } from 'vitest';
import { DEFAULT_CHALLENGE_POLICY, FindChallengePolicy, GetChallengePolicies, ResetChallengePolicies, SetChallengePolicy } from './ChallengePolicy';

/**
 * The table replaced four independent registries, and the reported bugs included a registration
 * silently resetting what another one had declared. These guards pin the semantics that make that
 * impossible: one entry per site, fields merged instead of replaced, and a site which declared
 * nothing left strictly to the upstream behaviour.
 */
describe('ChallengePolicy', () => {

    afterEach(() => ResetChallengePolicies());

    it('Should keep ONE entry when a site declares its behaviour in several calls', () => {
        SetChallengePolicy(/^https:\/\/one\.example\//, { forkHandling: true });
        SetChallengePolicy(/^https:\/\/one\.example\//, { clearanceReload: true, validationGrace: 60_000 });

        expect(GetChallengePolicies()).toHaveLength(1);
        expect(FindChallengePolicy('https://one.example/manga/demo/')).toMatchObject({
            forkHandling: true, clearanceReload: true, validationGrace: 60_000,
        });
    });

    it('Should not let a later declaration reset a field it does not mention', () => {
        SetChallengePolicy(/^https:\/\/two\.example\//, { stalledReload: true, stalledReloadBudget: 1 });
        SetChallengePolicy(/^https:\/\/two\.example\//, { clearanceReload: true });

        expect(FindChallengePolicy('https://two.example/')).toMatchObject({
            stalledReload: true, stalledReloadBudget: 1, clearanceReload: true,
        });
    });

    it('Should leave a site which declared nothing to the upstream behaviour', () => {
        expect(FindChallengePolicy('https://unregistered.example/manga/demo/')).toBeUndefined();
    });

    it('Should union the flags of every matching entry and let the first declaration win the scalars', () => {
        // Two patterns matching the same URL: a flag declared by either is on, while a scalar takes
        // the value of the FIRST registered match — so the outcome never depends on lookup order.
        SetChallengePolicy(/^https:\/\/(?:www\.)?three\.example\//, { forkHandling: true, validationGrace: 10_000 });
        SetChallengePolicy(/three\.example/, { clearanceReload: true, validationGrace: 20_000 });

        expect(FindChallengePolicy('https://www.three.example/')).toMatchObject({
            forkHandling: true, clearanceReload: true, validationGrace: 10_000,
        });
    });

    it('Should fill a newly declared site with the documented defaults', () => {
        SetChallengePolicy(/^https:\/\/four\.example\//, { stalledReload: true });

        expect(FindChallengePolicy('https://four.example/')).toMatchObject({
            ...DEFAULT_CHALLENGE_POLICY, stalledReload: true,
        });
    });

    it('Should keep the pattern a site registered, so a policy can be traced back to its connector', () => {
        const pattern = /^https:\/\/five\.example\//;
        SetChallengePolicy(pattern, { forkHandling: true });

        expect(FindChallengePolicy('https://five.example/')?.pattern).toBe(GetChallengePolicies()[0].pattern);
        expect(GetChallengePolicies()[0].pattern.source).toBe(pattern.source);
    });
});
