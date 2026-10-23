import type { ApiResult } from '../client/api-client';
import type { AuthOverride } from '../controllers/auth';
import type { Controllers } from '../controllers';
import { acacia, ntinda } from '../fixtures/places';
import { isRecord } from '../helpers/guards';
import type { Actor } from '../types/actors';
import type { CreateTripRequest, DriverStep, FareEstimateRequest, PaymentMethod, Point, ServiceType } from '../types/api';

export interface NewEstimateInput {
  readonly actor: Actor;
  readonly serviceType: ServiceType;
  readonly pickup?: Point;
  readonly dropoff?: Point;
  readonly promoCode?: string;
}

export interface BookTripInput {
  readonly actor: Actor;
  readonly estimateId: string;
  readonly paymentMethod: PaymentMethod;
  readonly scheduledFor?: string;
  readonly idempotencyKey?: string;
}

export interface CreatedEstimate {
  readonly id: string;
  readonly fareAmount: number;
}

export interface TripRef {
  readonly id: string;
  readonly status: string;
  readonly fareAmount: number;
}

export class TripLifecycle {
  constructor(private readonly controllers: Controllers) {}

  async reset(): Promise<ApiResult> {
    const result = await this.controllers.sandbox.reset();
    if (result.status !== 200) {
      throw new Error(`POST /v1/_reset failed. ${result.diagnostic}`);
    }
    return result;
  }

  async newEstimate(input: NewEstimateInput): Promise<CreatedEstimate> {
    const body: FareEstimateRequest = {
      pickup: input.pickup ?? acacia.point,
      dropoff: input.dropoff ?? ntinda.point,
      service_type: input.serviceType,
      ...(input.promoCode !== undefined ? { promo_code: input.promoCode } : {}),
    };
    const result = await this.controllers.estimates.create({
      auth: { token: input.actor.token },
      body,
    });
    if (result.status !== 201) {
      throw new Error(`newEstimate failed. ${result.diagnostic}`);
    }
    return readEstimate(result.body, result.diagnostic);
  }

  async book(input: BookTripInput): Promise<TripRef> {
    const body: CreateTripRequest = {
      estimate_id: input.estimateId,
      payment_method: input.paymentMethod,
      ...(input.scheduledFor !== undefined ? { scheduled_for: input.scheduledFor } : {}),
    };
    const result = await this.controllers.trips.create({
      auth: { token: input.actor.token },
      body,
      idempotencyKey: input.idempotencyKey,
    });
    if (result.status !== 201) {
      throw new Error(`book failed. ${result.diagnostic}`);
    }
    return readTripRef(result.body, result.diagnostic);
  }

  async drive(tripId: string, driver: Actor, steps: readonly DriverStep[]): Promise<TripRef> {
    if (steps.length === 0) {
      throw new Error('drive requires at least one step');
    }

    let latest: TripRef | undefined;
    for (const step of steps) {
      const result = await callDriverStep(this.controllers, step, tripId, { token: driver.token });
      if (result.status !== 200) {
        throw new Error(`drive ${step} failed for ${tripId}. ${result.diagnostic}`);
      }
      latest = readTripRef(result.body, result.diagnostic);
    }

    if (latest === undefined) {
      throw new Error(`drive did not return a trip for ${tripId}`);
    }
    return latest;
  }
}

function callDriverStep(controllers: Controllers, step: DriverStep, tripId: string, auth: AuthOverride): Promise<ApiResult> {
  switch (step) {
    case 'accept':
      return controllers.driver.accept(tripId, auth);
    case 'arrive':
      return controllers.driver.arrive(tripId, auth);
    case 'start':
      return controllers.driver.start(tripId, auth);
    case 'complete':
      return controllers.driver.complete(tripId, auth);
    default: {
      const unexpected: never = step;
      throw new Error(`Unknown driver step: ${String(unexpected)}`);
    }
  }
}

function readEstimate(body: unknown, diagnostic: string): CreatedEstimate {
  const record = expectRecord(body, diagnostic);
  const fare = expectRecord(record.fare, diagnostic);
  return {
    id: requireString(record.id, 'id', diagnostic),
    fareAmount: requireNumber(fare.amount, 'fare.amount', diagnostic),
  };
}

function readTripRef(body: unknown, diagnostic: string): TripRef {
  const record = expectRecord(body, diagnostic);
  const fare = expectRecord(record.fare, diagnostic);
  return {
    id: requireString(record.id, 'id', diagnostic),
    status: requireString(record.status, 'status', diagnostic),
    fareAmount: requireNumber(fare.amount, 'fare.amount', diagnostic),
  };
}

function expectRecord(value: unknown, diagnostic: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected an object. ${diagnostic}`);
  }
  return value;
}

function requireString(value: unknown, field: string, diagnostic: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${field}. ${diagnostic}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string, diagnostic: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Missing ${field}. ${diagnostic}`);
  }
  return value;
}
