import { describe, expect, it } from 'vitest';
import { checklistProgress, splitChecklistInput } from '@/features/checklist/checklistDisplay';

describe('splitChecklistInput', () => {
  it('splits at commas and line breaks, trimmed, without empty parts', () => {
    expect(splitChecklistInput(' 여권 ')).toEqual(['여권']);
    expect(splitChecklistInput('여권, 선크림,,  ，샌들\n모자')).toEqual(['여권', '선크림', '샌들', '모자']);
    expect(splitChecklistInput(' , ')).toEqual([]);
  });
});

describe('checklistProgress', () => {
  it('counts the checked items', () => {
    expect(checklistProgress([{ checked: true }, { checked: false }, { checked: true }])).toEqual({
      done: 2,
      total: 3,
    });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 });
  });
});
