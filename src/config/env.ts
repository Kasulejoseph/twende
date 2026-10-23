import type { Actor, ActorKey, ActorRole, Actors } from '../types/actors';
import type { ServiceType } from '../types/api';

export interface AppConfig {
  readonly candidateKey: string;
  readonly actors: Actors;
}

interface Persona {
  readonly key: ActorKey;
  readonly role: ActorRole;
  readonly name: string;
  readonly tokenEnv: string;
  readonly phone: string | null;
  readonly openingBalance: number | null;
  readonly services: readonly ServiceType[];
  readonly plate: string | null;
}

const PERSONAS: readonly Persona[] = [
  {
    key: 'sarah',
    role: 'rider',
    name: 'Sarah Nakato',
    tokenEnv: 'SARAH_TOKEN',
    phone: '+256700100231',
    openingBalance: 25_000,
    services: [],
    plate: null,
  },
  {
    key: 'brian',
    role: 'rider',
    name: 'Brian Okello',
    tokenEnv: 'BRIAN_TOKEN',
    phone: '+256700100487',
    openingBalance: 3_000,
    services: [],
    plate: null,
  },
  {
    key: 'joseph',
    role: 'driver',
    name: 'Joseph Ssemanda',
    tokenEnv: 'JOSEPH_TOKEN',
    phone: null,
    openingBalance: null,
    services: ['boda', 'send'],
    plate: 'UFA 412K',
  },
  {
    key: 'grace',
    role: 'driver',
    name: 'Grace Achieng',
    tokenEnv: 'GRACE_TOKEN',
    phone: null,
    openingBalance: null,
    services: ['boda', 'send'],
    plate: null,
  },
  {
    key: 'david',
    role: 'driver',
    name: 'David Mugisha',
    tokenEnv: 'DAVID_TOKEN',
    phone: null,
    openingBalance: null,
    services: ['car'],
    plate: null,
  },
];

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) {
    return cached;
  }

  cached = readConfig();
  return cached;
}

export function secretValues(config: AppConfig = getConfig()): readonly string[] {
  const { sarah, brian, joseph, grace, david } = config.actors;
  return [config.candidateKey, sarah.token, brian.token, joseph.token, grace.token, david.token];
}

function readConfig(): AppConfig {
  requireEnv('BASE_URL');
  const actors = PERSONAS.map(toActor);
  const sarah = actorByKey(actors, 'sarah');
  const brian = actorByKey(actors, 'brian');
  const joseph = actorByKey(actors, 'joseph');
  const grace = actorByKey(actors, 'grace');
  const david = actorByKey(actors, 'david');

  return {
    candidateKey: requireEnv('CANDIDATE_KEY'),
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

function toActor(persona: Persona): Actor {
  return {
    key: persona.key,
    role: persona.role,
    name: persona.name,
    token: requireEnv(persona.tokenEnv),
    phone: persona.phone,
    openingBalance: persona.openingBalance,
    services: persona.services,
    plate: persona.plate,
  };
}

function actorByKey(actors: readonly Actor[], key: ActorKey): Actor {
  const actor = actors.find((candidate) => candidate.key === key);
  if (actor === undefined) {
    throw new Error(`Missing persona ${key}.`);
  }
  return actor;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  if (value.length === 0) {
    throw new Error(`${name} is required. Copy .env.example to .env and set ${name}. Do not commit .env.`);
  }
  return value;
}
