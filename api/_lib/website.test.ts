import { describe, expect, it } from 'vitest';
import { privateAddress, websiteSnippets } from './website';

describe('website reader safety', () => {
  it('refuses private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) {
      expect(privateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:1.1.1.1']) expect(privateAddress(ip), ip).toBe(false);
  });

  it('never fetches internal or odd URLs', async () => {
    for (const u of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'file:///etc/passwd', 'http://example.com:8080/', 'http://user:pw@example.com/', 'not a url']) {
      expect(await websiteSnippets(u)).toEqual([]);
    }
  });
});
