import { describe, expect, it } from 'vitest';
import { isRegion, parseShareInput } from './social';

describe('parseShareInput', () => {
  it('takes a bare link', () => {
    const r = parseShareInput('https://www.instagram.com/reel/DSq8QI-D_qH/');
    expect(r.type).toBe('instagram');
    expect(r.extraText).toBe('');
  });
  it('pulls the link and post text out of Xiaohongshu share text', () => {
    const r = parseShareInput(
      '兰卡威5天4夜攻略｜天空之桥+缆车、Cenang海滩日落、Kilim红树林 http://xhslink.com/o/8AbCdEfGh 复制本条信息，打开【小红书】App查看精彩内容！',
    );
    expect(r.type).toBe('xiaohongshu');
    expect(r.url.href).toBe('http://xhslink.com/o/8AbCdEfGh');
    expect(r.extraText).toBe('兰卡威5天4夜攻略｜天空之桥+缆车、Cenang海滩日落、Kilim红树林');
  });
  it('rejects other sites', () => {
    expect(() => parseShareInput('https://example.com/post')).toThrow(/TikTok, Instagram/);
    expect(() => parseShareInput('no link here')).toThrow(/couldn't find a link/);
  });
});

describe('isRegion', () => {
  it('drops cities, states, archipelagos', () => {
    expect(isRegion(['locality', 'political'])).toBe(true);
    expect(isRegion(['administrative_area_level_1', 'political'])).toBe(true);
    expect(isRegion(['archipelago', 'natural_feature', 'establishment'])).toBe(true);
  });
  it('keeps beaches, parks and attractions', () => {
    expect(isRegion(['natural_feature', 'establishment'])).toBe(false);
    expect(isRegion(['tourist_attraction', 'point_of_interest', 'establishment'])).toBe(false);
    expect(isRegion(['park', 'point_of_interest'])).toBe(false);
  });
});
