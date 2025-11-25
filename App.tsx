import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GoogleGenAI, 
  LiveServerMessage, 
  Modality, 
  Type, 
  FunctionDeclaration 
} from '@google/genai';
import { 
  Mic, 
  MicOff, 
  Settings, 
  Home, 
  Activity, 
  PhoneCall, 
  Sun,
  Moon
} from 'lucide-react';
import { Device, DeviceType } from './types';
import DeviceCard from './components/DeviceCard';
import AudioVisualizer from './components/AudioVisualizer';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from './utils/audioUtils';

// --- INITIAL DATA ---
const INITIAL_DEVICES: Device[] = [
  { id: '1', name: 'Luz da Sala', type: DeviceType.LIGHT, isOn: false, value: 80, room: 'Sala de Estar' },
  { id: '2', name: 'Ar Condicionado', type: DeviceType.AC, isOn: true, value: 24, room: 'Quarto Principal' },
  { id: '3', name: 'Persiana', type: DeviceType.BLIND, isOn: false, value: 0, room: 'Sala de Estar' },
  { id: '4', name: 'Luz da Cozinha', type: DeviceType.LIGHT, isOn: true, value: 100, room: 'Cozinha' },
  { id: '5', name: 'Smart TV', type: DeviceType.APPLIANCE, isOn: false, room: 'Sala de Estar' },
  { id: '6', name: 'Luz de Leitura', type: DeviceType.LIGHT, isOn: false, value: 50, room: 'Quarto Principal' },
];

export default function App() {
  // --- STATE ---
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isAudioStreamActive, setIsAudioStreamActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Toque no microfone para falar');
  const [highContrast, setHighContrast] = useState(false);

  // --- REFS FOR AUDIO/GEMINI ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // Type 'any' used because Session type isn't exported easily, but implementation is safe
  const devicesRef = useRef(devices); // Keep a ref for the tool calls to access current state if needed (though we pass state updates)
  
  // Sync ref with state
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // --- DEVICE HANDLERS ---
  const toggleDevice = useCallback((id: string) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, isOn: !d.isOn } : d));
  }, []);

  const changeDeviceValue = useCallback((id: string, value: number) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, value } : d));
  }, []);

  // --- GEMINI TOOLS DEFINITION ---
  const tools: FunctionDeclaration[] = [
    {
      name: 'controlDevice',
      parameters: {
        type: Type.OBJECT,
        description: 'Ligar ou desligar um dispositivo específico.',
        properties: {
          deviceName: { type: Type.STRING, description: 'O nome do dispositivo a controlar (ex: Luz da Sala)' },
          action: { type: Type.STRING, description: '"turnOn" para ligar, "turnOff" para desligar' }
        },
        required: ['deviceName', 'action']
      }
    },
    {
      name: 'setDeviceValue',
      parameters: {
        type: Type.OBJECT,
        description: 'Ajustar um valor numérico de um dispositivo (temperatura, brilho, abertura).',
        properties: {
          deviceName: { type: Type.STRING, description: 'O nome do dispositivo.' },
          value: { type: Type.NUMBER, description: 'O valor alvo (ex: 22 para temperatura, 50 para brilho).' }
        },
        required: ['deviceName', 'value']
      }
    }
  ];

  // --- GEMINI LIVE CONNECTION ---
  const connectToGemini = async () => {
    try {
      setStatusMessage("Conectando...");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 }); // Output at 24kHz
      audioContextRef.current = ctx;
      
      // Prepare System Instruction with Device Context
      const deviceListString = devices.map(d => `${d.name} (no cômodo ${d.room})`).join(', ');
      const sysInstruction = `Você é o assistente virtual da Vitalidade Automação. 
      Seu tom é calmo, respeitoso e eficiente. Você ajuda pessoas com mobilidade reduzida.
      Dispositivos disponíveis: ${deviceListString}.
      Ao receber um comando, use as ferramentas disponíveis para controlar a casa.
      Responda em Português do Brasil de forma curta e amigável.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: sysInstruction,
          tools: [{ functionDeclarations: tools }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } // Calming voice
          }
        },
        callbacks: {
          onopen: async () => {
            setIsLiveConnected(true);
            setStatusMessage("Ouvindo... Pode falar.");
            await startMicrophone(sessionPromise);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // 1. Handle Audio Output
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const buffer = await decodeAudioData(
                base64ToUint8Array(audioData), 
                audioContextRef.current
              );
              playAudioBuffer(buffer);
            }

            // 2. Handle Tool Calls
            if (msg.toolCall) {
              const functionResponses = [];
              for (const fc of msg.toolCall.functionCalls) {
                const { name, args, id } = fc;
                let result = { status: 'error', message: 'Unknown device' };

                if (name === 'controlDevice') {
                  const target = devicesRef.current.find(d => 
                    d.name.toLowerCase().includes((args as any).deviceName.toLowerCase())
                  );
                  if (target) {
                    const shouldBeOn = (args as any).action === 'turnOn';
                    toggleDevice(target.id); // Update React State
                    result = { status: 'ok', message: `${target.name} agora está ${shouldBeOn ? 'ligado' : 'desligado'}` };
                  }
                } else if (name === 'setDeviceValue') {
                   const target = devicesRef.current.find(d => 
                    d.name.toLowerCase().includes((args as any).deviceName.toLowerCase())
                  );
                  if (target) {
                    changeDeviceValue(target.id, (args as any).value);
                    result = { status: 'ok', message: `${target.name} ajustado para ${(args as any).value}` };
                  }
                }
                
                functionResponses.push({
                  id,
                  name,
                  response: { result }
                });
              }

              // Send response back to model
              sessionPromise.then(session => {
                session.sendToolResponse({ functionResponses });
              });
            }
          },
          onclose: () => {
            disconnect();
          },
          onerror: (e) => {
            console.error("Gemini Error", e);
            setStatusMessage("Erro na conexão. Tente novamente.");
            disconnect();
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (error) {
      console.error("Connection failed", error);
      setStatusMessage("Falha ao iniciar. Verifique o microfone.");
      disconnect();
    }
  };

  const startMicrophone = async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        sampleRate: 16000
      }});
      
      // Use AudioContext to process raw PCM
      // We need a separate context for input matching the 16kHz requirement usually, 
      // but creating blobs handles resampling mostly. 
      // Let's use a 16kHz context for input processing.
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        
        sessionPromise.then(session => {
           session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(processor);
      processor.connect(inputCtx.destination); // Required for script processor to run

      inputSourceRef.current = source;
      processorRef.current = processor;
      setIsAudioStreamActive(true);

    } catch (err) {
      console.error("Mic error", err);
    }
  };

  const playAudioBuffer = (buffer: AudioBuffer) => {
    if (!audioContextRef.current) return;
    
    const src = audioContextRef.current.createBufferSource();
    src.buffer = buffer;
    src.connect(audioContextRef.current.destination);
    
    const ctxTime = audioContextRef.current.currentTime;
    // Schedule seamlessly
    const startAt = Math.max(ctxTime, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;
  };

  const disconnect = () => {
    setIsLiveConnected(false);
    setIsAudioStreamActive(false);
    setStatusMessage("Toque no microfone para falar");
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    // We cannot strictly 'close' the session object from here if it's just a promise wrapper 
    // without exposed close method in the library version, but we clean up our side.
    sessionRef.current = null;
    nextStartTimeRef.current = 0;
  };

  const toggleConnection = () => {
    if (isLiveConnected) {
      disconnect();
    } else {
      connectToGemini();
    }
  };

  // --- RENDER HELPERS ---
  const activeCount = devices.filter(d => d.isOn).length;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${highContrast ? 'bg-black text-yellow-400' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* HEADER / NAVIGATION */}
      <header className={`sticky top-0 z-30 backdrop-blur-md shadow-sm px-6 py-4 flex justify-between items-center
        ${highContrast ? 'bg-slate-900/90 border-b border-yellow-500' : 'bg-white/80 border-b border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-600 rounded-lg shadow-lg">
            <Activity className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Vitalidade</h1>
        </div>
        
        <button 
          onClick={() => setHighContrast(!highContrast)}
          className={`p-2 rounded-full transition-colors ${highContrast ? 'bg-yellow-400 text-black' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          aria-label="Contraste"
        >
          {highContrast ? <Sun className="w-6 h-6"/> : <Moon className="w-6 h-6"/>}
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-32">
        
        {/* HERO SECTION */}
        <div className="mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold mb-2">Bem-vindo a sua casa.</h2>
          <p className={`text-lg ${highContrast ? 'text-yellow-200' : 'text-slate-500'}`}>
            {activeCount === 0 
              ? "Tudo tranquilo. Nenhum dispositivo ligado." 
              : `${activeCount} dispositivos estão ativos no momento.`}
          </p>
        </div>

        {/* VOICE ASSISTANT CARD (PROMINENT) */}
        <section className="mb-12">
          <div className={`
            relative w-full rounded-3xl p-8 overflow-hidden transition-all duration-500 shadow-2xl
            ${isLiveConnected 
              ? (highContrast ? 'bg-slate-800 border-2 border-yellow-400' : 'bg-gradient-to-br from-primary-600 to-primary-800 text-white')
              : (highContrast ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200')
            }
          `}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex-1 text-center md:text-left">
                <h3 className={`text-2xl font-bold mb-2 ${!isLiveConnected && !highContrast ? 'text-slate-800' : 'text-white'}`}>
                  Assistente de Voz
                </h3>
                <p className={`text-lg font-medium opacity-90 ${!isLiveConnected && !highContrast ? 'text-slate-500' : 'text-primary-100'}`}>
                  {statusMessage}
                </p>
                {isLiveConnected && (
                   <p className="mt-2 text-sm opacity-75">Diga "Ligue a luz da sala" ou "Feche as persianas".</p>
                )}
              </div>

              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={toggleConnection}
                  className={`
                    w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 scale-100 hover:scale-105 active:scale-95
                    ${isLiveConnected 
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse-slow' 
                      : 'bg-primary-500 hover:bg-primary-600 text-white'
                    }
                  `}
                  aria-label={isLiveConnected ? "Parar assistente" : "Iniciar assistente"}
                >
                  {isLiveConnected ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                </button>
                {isLiveConnected && (
                  <AudioVisualizer isActive={isLiveConnected} isUserSpeaking={isAudioStreamActive} />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* DEVICE GRID */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Home className={highContrast ? 'text-yellow-400' : 'text-slate-400'} />
            <h3 className="text-xl font-bold uppercase tracking-wider text-slate-500">Seus Dispositivos</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device) => (
              <DeviceCard 
                key={device.id} 
                device={device} 
                onToggle={toggleDevice}
                onChangeValue={changeDeviceValue}
              />
            ))}
          </div>
        </section>

        {/* EMERGENCY FAB */}
        <div className="fixed bottom-6 right-6 z-50">
          <button 
            className="group flex items-center justify-center w-16 h-16 bg-red-100 text-red-600 rounded-full shadow-lg border-2 border-red-200 hover:bg-red-600 hover:text-white transition-all duration-300"
            onClick={() => alert("Função de emergência: Contato enviado para familiar responsável.")}
            aria-label="Botão de Emergência"
          >
            <PhoneCall className="w-8 h-8" />
            <span className="absolute right-20 bg-slate-800 text-white px-3 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              Emergência
            </span>
          </button>
        </div>

      </main>
    </div>
  );
}
