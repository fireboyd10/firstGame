import { describe, expect, it } from 'vitest';
import { verifyPhoneIdentity } from './party';

describe('phone room identity verification', () => {
  const endpoint = { host: '192.168.1.25', port: 4567, fingerprint: 'abcdef123456' + '0'.repeat(52) };
  it('accepts the host-screen code and keeps the full certificate pin for reconnects', () => {
    expect(verifyPhoneIdentity(endpoint, 'ABCD-EF12-3456')).toEqual(endpoint);
  });
  it('rejects a substituted discovery certificate and invalid codes before joining', () => {
    expect(() => verifyPhoneIdentity({ ...endpoint, fingerprint: 'f'.repeat(64) }, 'ABCD-EF12-3456')).toThrow('does not match');
    expect(() => verifyPhoneIdentity(endpoint, '123456')).toThrow('security code');
    expect(() => verifyPhoneIdentity({ ...endpoint, fingerprint: '' }, 'ABCD-EF12-3456')).toThrow('does not match');
  });
});
