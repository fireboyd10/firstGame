import { Capacitor } from '@capacitor/core';
import { PhoneParty } from '../multiplayer/phone-host';

const REVIEW_CODE_DIGEST = '682c6972c0785ecb50594ab2bfc6b9715c361f85e8df1e69e7cc6f8081269d9d';
const verifyCode = async (code: string): Promise<boolean> => (await PhoneParty.sha256({ value: code })).digest === REVIEW_CODE_DIGEST;

/** Explicit reviewer access for this app session; never grants purchased ownership. */
export class ReviewAccess {
  private enabled = false;
  constructor(readonly available: boolean, private verify: (code: string) => Promise<boolean> = verifyCode) {}
  get active(): boolean { return this.enabled; }
  async activate(input: string): Promise<boolean> {
    if (!this.available) return false;
    const code = input.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{24}$/.test(code)) return false;
    try { if (!await this.verify(code)) return false; }
    catch { return false; }
    this.enabled = true; return true;
  }
  exit(): void { this.enabled = false; }
}
export const reviewAccess = new ReviewAccess(Capacitor.isNativePlatform());
