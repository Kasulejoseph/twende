import fs from 'fs';
import path from 'path';

import type { Actor, Actors } from '../types/actors';

export const DEFAULT_BASE_URL = 'https://staging-twende-backend.safeboda.com/api/qa-sandbox';

const DEFAULT_TOKENS = {
  SARAH_TOKEN: 'rdr_tok_nakato_5f2a91',
  BRIAN_TOKEN: 'rdr_tok_okello_8c71d4',
  JOSEPH_TOKEN: 'drv_tok_ssemanda_3e09b7',
  GRACE_TOKEN: 'drv_tok_achieng_7a44c2',
  DAVID_TOKEN: 'drv_tok_mugisha_1b6f80',
} as const;

export interface AppConfig {
  readonly baseUrl: string;
  readonly candidateKey: string;
  readonly actors: Actors;
}

let cached: AppConfig | undefined;

export function loadEnvFile(filePath = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getConfig(): AppConfig {
  if (cached) {
    return cached;
  }

  loadEnvFile();
  cached = readConfig();
  return cached;
}

export function secretValues(config: AppConfig = getConfig()): readonly string[] {
  return [
    config.candidateKey,
    config.actors.sarah.token,
    config.actors.brian.token,
    config.actors.joseph.token,
    config.actors.grace.token,
    config.actors.david.token,
  ];
}

function readConfig(): AppConfig {
  const baseUrl = (process.env.BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const candidateKey = requireEnv('CANDIDATE_KEY');
  const sarah: Actor = {
    key: 'sarah',
    role: 'rider',
    name: 'Sarah Nakato',
    token: envOrDefault('SARAH_TOKEN', DEFAULT_TOKENS.SARAH_TOKEN),
    phone: '+256700100231',
    openingBalance: 25_000,
    services: [],
    plate: null,
  };
  const brian: Actor = {
    key: 'brian',
    role: 'rider',
    name: 'Brian Okello',
    token: envOrDefault('BRIAN_TOKEN', DEFAULT_TOKENS.BRIAN_TOKEN),
    phone: '+256700100487',
    openingBalance: 3_000,
    services: [],
    plate: null,
  };
  const joseph: Actor = {
    key: 'joseph',
    role: 'driver',
    name: 'Joseph Ssemanda',
    token: envOrDefault('JOSEPH_TOKEN', DEFAULT_TOKENS.JOSEPH_TOKEN),
    phone: null,
    openingBalance: null,
    services: ['boda', 'send'],
    plate: 'UFA 412K',
  };
  const grace: Actor = {
    key: 'grace',
    role: 'driver',
    name: 'Grace Achieng',
    token: envOrDefault('GRACE_TOKEN', DEFAULT_TOKENS.GRACE_TOKEN),
    phone: null,
    openingBalance: null,
    services: ['boda', 'send'],
    plate: null,
  };
  const david: Actor = {
    key: 'david',
    role: 'driver',
    name: 'David Mugisha',
    token: envOrDefault('DAVID_TOKEN', DEFAULT_TOKENS.DAVID_TOKEN),
    phone: null,
    openingBalance: null,
    services: ['car'],
    plate: null,
  };

  return {
    baseUrl,
    candidateKey,
    actors: {
      sarah,
      brian,
      joseph,
      grace,
      david,
      riders: [sarah, brian],
      drivers: [joseph, grace, david],
    },
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  if (value.length === 0) {
    throw new Error(`${name} is required. Copy .env.example to .env and set ${name}. Do not commit .env.`);
  }
  return value;
}

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim() ?? '';
  return value.length > 0 ? value : fallback;
}
