import type { ServiceType } from './api';

export type ActorKey = 'sarah' | 'brian' | 'joseph' | 'grace' | 'david';
export type ActorRole = 'rider' | 'driver';

export interface Actor {
  readonly key: ActorKey;
  readonly role: ActorRole;
  readonly name: string;
  readonly token: string;
  readonly phone: string | null;
  readonly openingBalance: number | null;
  readonly services: readonly ServiceType[];
  readonly plate: string | null;
}

export interface Actors {
  readonly sarah: Actor;
  readonly brian: Actor;
  readonly joseph: Actor;
  readonly grace: Actor;
  readonly david: Actor;
  readonly riders: readonly Actor[];
  readonly drivers: readonly Actor[];
}
