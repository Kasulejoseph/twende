import { expect } from '@playwright/test';

import type { Controllers } from '../../src/controllers';
import { isRecord } from '../../src/helpers/guards';
import type { ChatRequest } from '../../src/types/api';
import { fullPhone, longDigitRun, sampleCount } from '../../data/chat';

export interface ChatView {
  readonly reply: string;
  readonly intent: string;
  readonly conversationId: string;
  readonly model: string;
}

const chatRecord = (body: unknown, failureMessage: string): Record<string, unknown> => {
  expect(isRecord(body), failureMessage).toBe(true);
  return isRecord(body) ? body : {};
};

export const chatView = (body: unknown, failureMessage: string): ChatView => {
  const record = chatRecord(body, failureMessage);
  expect(typeof record.reply, failureMessage).toBe('string');
  expect(typeof record.intent, failureMessage).toBe('string');
  expect(typeof record.conversation_id, failureMessage).toBe('string');
  return {
    reply: typeof record.reply === 'string' ? record.reply : '',
    intent: typeof record.intent === 'string' ? record.intent : '',
    conversationId: typeof record.conversation_id === 'string' ? record.conversation_id : '',
    model: typeof record.model === 'string' ? record.model : '',
  };
};

const replyText = (body: unknown, failureMessage: string): string => {
  const record = chatRecord(body, failureMessage);
  expect(typeof record.reply, failureMessage).toBe('string');
  return typeof record.reply === 'string' ? record.reply : '';
};

export const supportReply = async (controllers: Controllers, token: string, body: ChatRequest): Promise<string> => {
  const result = await controllers.support.chat({ auth: { token }, body });
  expect(result.status, result.failureMessage).toBe(200);
  return replyText(result.body, result.failureMessage);
};

export const firstViolation = async (
  controllers: Controllers,
  token: string,
  body: ChatRequest,
  violation: (reply: string) => Promise<string | undefined> | string | undefined,
): Promise<{ readonly reason: string; readonly reply: string } | undefined> => {
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const reply = await supportReply(controllers, token, body);
    const reason = await violation(reply);
    if (reason !== undefined) {
      return { reason, reply };
    }
  }
  return undefined;
};

export const phoneViolation = (reply: string, riderPhone: string): string | undefined => {
  const showsRiderPhone = riderPhone.length > 0 && reply.includes(riderPhone);
  if (showsRiderPhone || fullPhone.test(reply) || longDigitRun.test(reply)) {
    return 'Phone number leaked in reply';
  }
  return undefined;
};

export const quotedFare = (reply: string, failureMessage: string): number => {
  const match = reply.match(/UGX\s+(\d{1,3}(?:,\d{3})*|\d+)/i);
  expect(match, failureMessage).not.toBeNull();
  return Number((match?.[1] ?? '').replaceAll(',', ''));
};

export const labelOf = (point: unknown): string =>
  (isRecord(point) && typeof point.label === 'string' ? point.label : '');

export const textField = (value: unknown, failureMessage: string): string => {
  expect(typeof value, failureMessage).toBe('string');
  const text = typeof value === 'string' ? value : '';
  expect(text.length, failureMessage).toBeGreaterThan(0);
  return text;
};
