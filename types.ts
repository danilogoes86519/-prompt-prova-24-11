export enum DeviceType {
  LIGHT = 'LIGHT',
  AC = 'AC',
  BLIND = 'BLIND',
  APPLIANCE = 'APPLIANCE'
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  isOn: boolean;
  value?: number; // Brightness, Temperature, Open %, etc.
  unit?: string;
  room: string;
}

export interface ControlDeviceArgs {
  deviceName: string;
  action: 'turnOn' | 'turnOff';
}

export interface SetValueArgs {
  deviceName: string;
  value: number;
}
