import { describe, it, expect, beforeEach } from 'vitest';
import { LocalAIProvider } from '../src/background/ai/local-provider';

describe('LocalAIProvider', () => {
  let provider: LocalAIProvider;

  beforeEach(() => {
    provider = new LocalAIProvider();
  });

  it('matches skills using exact and common aliases', async () => {
    const res = await provider.matchSkills({
      jobSkills: ['ReactJS', 'NodeJS', 'Python', 'Kubernetes', 'Golang'],
      userSkills: ['React', 'Node', 'Python', 'Go']
    });

    expect(res.matches.length).toBe(4);
    expect(res.matches.some((m) => m.jobSkill === 'ReactJS' && m.profileSkill === 'React')).toBe(true);
    expect(res.matches.some((m) => m.jobSkill === 'NodeJS' && m.profileSkill === 'Node')).toBe(true);
    expect(res.matches.some((m) => m.jobSkill === 'Golang' && m.profileSkill === 'Go')).toBe(true);
    expect(res.unmatched).toContain('Kubernetes');
  });

  it('validates grounding and flags unsupported claims', async () => {
    const groundedRes = await provider.validateGrounding({
      textToAudit: 'I have 5 years of software engineering experience.',
      approvedEvidence: ['Software Engineer (5 years)', 'TypeScript', 'React']
    });
    expect(groundedRes.status).toBe('passed');
    expect(groundedRes.unsupportedClaims.length).toBe(0);

    const ungroundedRes = await provider.validateGrounding({
      textToAudit: 'I have 12 years of software engineering experience.',
      approvedEvidence: ['Software Engineer (3 years)']
    });
    expect(ungroundedRes.status).toBe('failed');
    expect(ungroundedRes.unsupportedClaims.length).toBeGreaterThan(0);
  });

  it('generates cover letter interpolating predefined template with candidate name and role', async () => {
    const res = await provider.generateCoverLetter({
      company: 'Datadog',
      role: 'Staff SRE',
      candidateName: 'Jane Doe',
      predefinedTemplate: 'Dear {company},\n\nI am applying for {role}.\n\nBest,\n{candidateName}'
    });

    expect(res.groundingStatus).toBe('passed');
    expect(res.coverLetter).toContain('Dear Datadog');
    expect(res.coverLetter).toContain('Staff SRE');
    expect(res.coverLetter).toContain('Jane Doe');
  });

  it('generates cover letter using JD text, company, and role signed with real candidate name', async () => {
    const res = await provider.generateCoverLetter({
      company: 'Stripe',
      role: 'Backend Engineer',
      candidateName: 'John Smith',
      jdText: 'Looking for a Backend Engineer with strong distributed systems skills.',
      profileEvidence: ['5 years distributed systems experience', 'Go and Rust expertise']
    });

    expect(res.groundingStatus).toBe('passed');
    expect(res.coverLetter).toContain('Stripe');
    expect(res.coverLetter).toContain('Backend Engineer');
    expect(res.coverLetter).toContain('John Smith');
    expect(res.coverLetter).not.toContain('[Candidate Name]');
    expect(res.coverLetter).not.toContain('[Company Name]');
  });
});
