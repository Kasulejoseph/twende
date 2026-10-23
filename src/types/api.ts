export const SERVICE_TYPES = ['boda', 'car', 'send'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'wallet'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TRIP_STATUSES = [
  'requested',
  'accepted',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TOP_UP_PROVIDERS = ['mtn_momo', 'airtel_money'] as const;
export type TopUpProvider = (typeof TOP_UP_PROVIDERS)[number];

export const DRIVER_STEPS = ['accept', 'arrive', 'start', 'complete'] as const;
export type DriverStep = (typeof DRIVER_STEPS)[number];

export interface Point {
  readonly lat: number;
  readonly lng: number;
  readonly label?: string;
}

export interface FareEstimateRequest {
  readonly pickup: Point;
  readonly dropoff: Point;
  readonly service_type: ServiceType;
  readonly promo_code?: string;
}

export interface CreateTripRequest {
  readonly estimate_id: string;
  readonly payment_method: PaymentMethod;
  readonly scheduled_for?: string;
  readonly notes?: string;
}

export interface RatingRequest {
  readonly stars: number;
  readonly comment?: string;
}

export interface TopUpRequest {
  readonly amount: number;
  readonly provider: TopUpProvider;
  readonly phone: string;
}

export interface ChatRequest {
  readonly message: string;
  readonly trip_id?: string;
  readonly conversation_id?: string;
}
