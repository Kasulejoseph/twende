import { isRecord } from './guards';

interface LeakRule {
  readonly name: string;
  readonly pattern: RegExp;
}

const LEAK_RULES: readonly LeakRule[] = [
  { name: 'stack', pattern: /\bat\s+[\w$.]+\s+\(|\bstack trace\b|node:internal/i },
  { name: 'sql', pattern: /\bselect\b[\s\S]{0,80}\bfrom\b|\binsert\s+into\b|\bdelete\s+from\b|\bupdate\b[\s\S]{0,40}\bset\b/i },
  { name: 'path', pattern: /(?:\/Users\/|\/home\/|\/var\/|\\Users\\|node_modules|[A-Za-z]:\\)/ },
];

export function internalLeakViolations(value: unknown, secrets: readonly string[] = []): readonly string[] {
  const texts: string[] = [];
  collectStrings(value, texts);
  const violations: string[] = [];

  for (const text of texts) {
    for (const rule of LEAK_RULES) {
      if (rule.pattern.test(text)) {
        violations.push(`${rule.name} pattern matched`);
      }
    }

    for (const secret of secrets) {
      if (secret.length > 0 && text.includes(secret)) {
        violations.push('response contains a credential');
      }
    }
  }

  return violations;
}

function collectStrings(value: unknown, found: string[]): void {
  if (typeof value === 'string') {
    found.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, found);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const item of Object.values(value)) {
    collectStrings(item, found);
  }
}
