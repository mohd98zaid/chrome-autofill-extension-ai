import { describe, it, expect } from 'vitest';
import { deduplicateSkills, deduplicateExperiences, deduplicateEducation } from '../src/storage';
import { Skill } from '../src/types/profile';

describe('Storage Deduplication', () => {
  it('deduplicates skills case-insensitively and preserves highest proficiency', () => {
    const skills: Skill[] = [
      {
        id: '1',
        canonicalName: 'Python',
        aliases: ['py'],
        proficiency: 'intermediate',
        years: 3,
        source: ['resume'],
        verified: false
      },
      {
        id: '2',
        canonicalName: 'python',
        aliases: ['python3'],
        proficiency: 'expert',
        years: 5,
        source: ['profile'],
        verified: true
      },
      {
        id: '3',
        canonicalName: 'React',
        aliases: [],
        proficiency: 'advanced',
        years: 4,
        source: ['profile'],
        verified: true
      },
      {
        id: '4',
        canonicalName: 'REACT',
        aliases: ['reactjs'],
        proficiency: 'intermediate',
        years: 2,
        source: ['resume'],
        verified: false
      }
    ];

    const deduplicated = deduplicateSkills(skills);
    expect(deduplicated).toHaveLength(2);

    const python = deduplicated.find((s) => s.canonicalName.toLowerCase() === 'python');
    expect(python).toBeDefined();
    expect(python?.proficiency).toBe('expert');
    expect(python?.years).toBe(5);
    expect(python?.verified).toBe(true);
    expect(python?.aliases).toContain('py');
    expect(python?.aliases).toContain('python3');

    const react = deduplicated.find((s) => s.canonicalName.toLowerCase() === 'react');
    expect(react).toBeDefined();
    expect(react?.proficiency).toBe('advanced');
  });

  it('deduplicates experiences based on company and title', () => {
    const exps = [
      {
        id: 'exp1',
        company: 'Tata Consultancy Services',
        title: 'System Engineer',
        startDate: '2021',
        endDate: 'Present',
        current: true,
        location: 'Delhi',
        description: 'First entry',
        skills: [],
        achievements: [],
        verified: true
      },
      {
        id: 'exp2',
        company: 'tata consultancy services',
        title: 'system engineer',
        startDate: '2021',
        endDate: 'Present',
        current: true,
        location: 'Delhi',
        description: 'Duplicate entry',
        skills: [],
        achievements: [],
        verified: true
      }
    ];

    const deduplicated = deduplicateExperiences(exps);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].id).toBe('exp1');
  });

  it('deduplicates education based on institution and degree', () => {
    const edus = [
      {
        id: 'edu1',
        institution: 'AKTU',
        degree: 'B.Tech',
        field: 'CSE',
        startDate: '2015',
        endDate: '2019',
        verified: true
      },
      {
        id: 'edu2',
        institution: 'aktu',
        degree: 'b.tech',
        field: 'CSE',
        startDate: '2015',
        endDate: '2019',
        verified: true
      }
    ];

    const deduplicated = deduplicateEducation(edus);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].id).toBe('edu1');
  });
});
