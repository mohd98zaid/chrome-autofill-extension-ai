import { describe, it, expect } from 'vitest';
import { calculateTotalExperience } from '../src/utils/experience-calculator';
import { Experience } from '../src/types/profile';

describe('ExperienceCalculator', () => {
  const makeExp = (startDate: string, endDate: string, current = false): Experience => ({
    id: `exp_${Math.random()}`,
    company: 'Company',
    title: 'Engineer',
    startDate,
    endDate,
    current,
    location: '',
    description: '',
    skills: [],
    achievements: [],
    verified: true
  });

  it('calculates sequential non-overlapping employment periods', () => {
    const experiences: Experience[] = [
      makeExp('2018-01', '2020-01'), // 24 months
      makeExp('2020-06', '2022-06')  // 24 months
    ];

    const result = calculateTotalExperience(experiences);
    expect(result).not.toBeNull();
    expect(result?.totalMonths).toBe(48);
    expect(result?.totalYears).toBe(4);
  });

  it('merges overlapping intervals without double-counting (Rule 6)', () => {
    const experiences: Experience[] = [
      makeExp('2020-01', '2022-01'), // Jan 2020 to Jan 2022 (24 months)
      makeExp('2021-01', '2023-01')  // Jan 2021 to Jan 2023 (overlaps Jan 2021-Jan 2022)
    ];

    // Merged span is Jan 2020 to Jan 2023 = 36 months = 3.0 years, NOT 48 months (4 years)
    const result = calculateTotalExperience(experiences);
    expect(result).not.toBeNull();
    expect(result?.totalMonths).toBe(36);
    expect(result?.totalYears).toBe(3);
  });

  it('handles completely nested intervals', () => {
    const experiences: Experience[] = [
      makeExp('2019-01', '2023-01'), // 48 months
      makeExp('2020-01', '2021-01')  // 12 months inside the 48 months
    ];

    const result = calculateTotalExperience(experiences);
    expect(result).not.toBeNull();
    expect(result?.totalMonths).toBe(48);
    expect(result?.totalYears).toBe(4);
  });

  it('returns null if any experience lacks valid dates', () => {
    const experiences: Experience[] = [
      makeExp('2020-01', ''), // missing end date and not marked current
      makeExp('2021-01', '2022-01')
    ];

    const result = calculateTotalExperience(experiences);
    expect(result).toBeNull();
  });

  it('returns null for empty experiences array', () => {
    const result = calculateTotalExperience([]);
    expect(result).toBeNull();
  });

  it('handles current employment with valid start date', () => {
    const experiences: Experience[] = [
      makeExp('2023-01', '', true) // current
    ];

    const result = calculateTotalExperience(experiences);
    expect(result).not.toBeNull();
    expect(result!.totalMonths).toBeGreaterThan(0);
  });
});
