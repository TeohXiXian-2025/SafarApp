import { describe, expect, it } from 'vitest';
import { airportByCode } from './google';

describe('airportByCode', () => {
  it('turns a ticket code into the airport, with no API', () => {
    expect(airportByCode('FCO')).toMatchObject({ name: expect.stringMatching(/Fiumicino/), address: 'Rome, IT' });
    expect(airportByCode(' kul ')?.name).toBe('Kuala Lumpur International Airport');
    expect(airportByCode('VCE')?.location.lat).toBeCloseTo(45.5, 1);
  });
  it('is null for anything that is not a known airport code', () => {
    expect(airportByCode('XYZ')).toBeNull();
    expect(airportByCode('Rome')).toBeNull();
    expect(airportByCode(undefined)).toBeNull();
  });
});
