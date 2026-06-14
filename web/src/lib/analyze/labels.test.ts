import { describe, it, expect } from 'vitest';
import { humanizeCode, modeLabel, flagLabel } from './labels';

describe('labels', () => {
  it('humanizes snake/kebab codes as a fallback', () => {
    expect(humanizeCode('skewed_range')).toBe('Skewed Range');
    expect(humanizeCode('fan-out')).toBe('Fan Out');
    expect(humanizeCode('hash_join_spill')).toBe('Hash Join Spill');
  });

  it('labels known modes and falls back for unknown ones', () => {
    expect(modeLabel('high_skew')).toBe('High skew');
    expect(modeLabel('fan_out')).toBe('Fan-out');
    expect(modeLabel('future_mode')).toBe('Future Mode');
  });

  it('labels known flag codes with a neutral description', () => {
    expect(flagLabel('seq_scan').label).toBe('Sequential scan');
    expect(flagLabel('seq_scan').description).toMatch(/scanned the whole table/i);
    expect(flagLabel('rows_misestimated').label).toBe('Row estimate off ≥10×');
  });

  it('falls back to a humanized label with no description for unknown codes', () => {
    expect(flagLabel('new_detector_code')).toEqual({
      label: 'New Detector Code',
      description: '',
    });
  });
});
