import type { ApiClient } from '../client/api-client';
import { DriverController } from './driver.controller';
import { EstimatesController } from './estimates.controller';
import { PlacesController } from './places.controller';
import { RiderController } from './rider.controller';
import { SandboxController } from './sandbox.controller';
import { SupportController } from './support.controller';
import { TripsController } from './trips.controller';
import { WalletController } from './wallet.controller';

export interface Controllers {
  readonly places: PlacesController;
  readonly rider: RiderController;
  readonly wallet: WalletController;
  readonly estimates: EstimatesController;
  readonly trips: TripsController;
  readonly driver: DriverController;
  readonly support: SupportController;
  readonly sandbox: SandboxController;
}

export const createControllers = (api: ApiClient): Controllers => ({
  places: new PlacesController(api),
  rider: new RiderController(api),
  wallet: new WalletController(api),
  estimates: new EstimatesController(api),
  trips: new TripsController(api),
  driver: new DriverController(api),
  support: new SupportController(api),
  sandbox: new SandboxController(api),
});
