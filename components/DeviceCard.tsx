import React from 'react';
import { Device, DeviceType } from '../types';
import { Lightbulb, Thermometer, Blinds, Power, Tv } from 'lucide-react';

interface DeviceCardProps {
  device: Device;
  onToggle: (id: string) => void;
  onChangeValue: (id: string, value: number) => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device, onToggle, onChangeValue }) => {
  const getIcon = () => {
    switch (device.type) {
      case DeviceType.LIGHT: return <Lightbulb className={`w-8 h-8 ${device.isOn ? 'text-yellow-400 fill-yellow-400' : 'text-slate-400'}`} />;
      case DeviceType.AC: return <Thermometer className={`w-8 h-8 ${device.isOn ? 'text-blue-400' : 'text-slate-400'}`} />;
      case DeviceType.BLIND: return <Blinds className={`w-8 h-8 ${device.isOn ? 'text-primary-500' : 'text-slate-400'}`} />;
      case DeviceType.APPLIANCE: return <Tv className={`w-8 h-8 ${device.isOn ? 'text-green-500' : 'text-slate-400'}`} />;
      default: return <Power className="w-8 h-8" />;
    }
  };

  const getLabel = () => {
    if (device.type === DeviceType.AC) return `${device.value}°C`;
    if (device.type === DeviceType.BLIND) return `${device.value}% Aberto`;
    if (device.type === DeviceType.LIGHT && device.value !== undefined) return `${device.value}% Brilho`;
    return device.isOn ? 'LIGADO' : 'DESLIGADO';
  };

  return (
    <div className={`
      relative overflow-hidden rounded-2xl p-6 transition-all duration-300 shadow-sm
      ${device.isOn ? 'bg-white border-2 border-primary-500 shadow-lg scale-[1.02]' : 'bg-slate-100 border-2 border-transparent opacity-90'}
    `}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-50 rounded-xl shadow-inner">
          {getIcon()}
        </div>
        <button
          onClick={() => onToggle(device.id)}
          className={`
            w-12 h-8 rounded-full transition-colors relative focus:outline-none focus:ring-4 focus:ring-primary-300
            ${device.isOn ? 'bg-primary-600' : 'bg-slate-300'}
          `}
          aria-label={`Alternar ${device.name}`}
        >
          <div className={`
            w-6 h-6 bg-white rounded-full shadow-md absolute top-1 transition-transform duration-300
            ${device.isOn ? 'left-5' : 'left-1'}
          `}/>
        </button>
      </div>

      <h3 className="text-xl font-bold text-slate-800 mb-1 leading-tight">{device.name}</h3>
      <p className="text-sm text-slate-500 mb-4 font-medium">{device.room}</p>

      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${device.isOn ? 'text-primary-600' : 'text-slate-400'}`}>
          {getLabel()}
        </span>
        
        {device.value !== undefined && device.isOn && (
          <div className="flex gap-2">
            <button 
              onClick={() => onChangeValue(device.id, Math.max(0, (device.value || 0) - 10))}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 active:scale-95 text-slate-600 font-bold"
              aria-label="Diminuir"
            >
              -
            </button>
            <button 
              onClick={() => onChangeValue(device.id, Math.min(100, (device.value || 0) + 10))}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-slate-200 active:scale-95 text-slate-600 font-bold"
              aria-label="Aumentar"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceCard;
