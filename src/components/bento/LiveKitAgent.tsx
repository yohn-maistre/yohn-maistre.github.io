import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  BarVisualizer,
  useVoiceAssistant,
  ControlBar,
} from '@livekit/components-react';
import { useCallback, useState } from 'react';
import '@livekit/components-styles';

import OrbAnimation from './OrbAnimation';

export default function LiveKitAgent() {
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [started, setStarted] = useState(false);

  const startAgent = useCallback(async () => {
    try {
      const response = await fetch('/api/connection-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      setToken(data.participantToken);
      setServerUrl(data.serverUrl);
      setStarted(true);
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  }, []);

  const onDisconnected = useCallback(() => {
    setStarted(false);
    setToken('');
    setServerUrl('');
  }, []);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-secondary/25">
      {!started ? (
        <div className="flex h-full w-full items-center justify-center relative">
             <OrbAnimation state="connecting" onConnect={startAgent} />
        </div>
      ) : (
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          audio={true}
          video={false}
          onDisconnected={onDisconnected}
          className="flex h-full w-full flex-col items-center justify-center gap-4"
        >
          <div className="flex h-full w-full items-center justify-center">
            <AgentVisualizer />
          </div>
          <RoomAudioRenderer />
          <StartAudio label="Click to allow audio playback" />
          <ControlBar 
            controls={{ microphone: true, camera: false, screenShare: false, chat: false }}
            style={{ '--lk-control-bar-button-icon-color': 'black' } as React.CSSProperties}
          />
        </LiveKitRoom>
      )}
    </div>
  );
}

function AgentVisualizer() {
  const { state, audioTrack } = useVoiceAssistant();
  return <OrbAnimation state={state} audioTrack={audioTrack?.mediaStreamTrack} />;
}

