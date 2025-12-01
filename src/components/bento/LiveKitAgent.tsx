


import { useSpeakingParticipants, LiveKitRoom, useRoomContext, useParticipants, useTracks, AudioTrack } from '@livekit/components-react';







import { Room, RoomEvent, Participant } from 'livekit-client';







import { useState, useEffect, useRef } from 'react';















export default function LiveKitAgent() {







  const [token, setToken] = useState('');







  const [serverUrl, setServerUrl] = useState('');







  const [started, setStarted] = useState(false);















    const startAgent = async () => {















      const response = await fetch('/api/connection-details', {















        method: 'POST',















        headers: {















          'Content-Type': 'application/json'















        },















        body: JSON.stringify({})















      });















      const data = await response.json();















      setToken(data.participantToken);















      setServerUrl(data.serverUrl);















      setStarted(true);















    };















  const stopAgent = () => {







    console.log('Stopping agent session...');







    setStarted(false);







    setToken('');







    setServerUrl('');







  }















  return (







    <div>







      {!started && <button onClick={startAgent}>Start Agent</button>}







      {started && token && serverUrl && (







                  <LiveKitRoom







                    token={token}







                    serverUrl={serverUrl}







                    connect={true}







                    audio={true}







                    onDisconnected={stopAgent}







                  >







          <AgentView />







        </LiveKitRoom>







      )}







    </div>







  );







}















function AgentView() {



  const room = useRoomContext();



  const participants = useParticipants();



  const speakingParticipants = useSpeakingParticipants();



  const tracks = useTracks();



  const audioEl = useRef<HTMLAudioElement>(null);







  const agentParticipant = participants.find((p) => !p.isLocal);



  const agentAudioTrack = tracks.find(



    (track) => track.participant.identity === agentParticipant?.identity && track.source === 'microphone',



  );







  useEffect(() => {



    if (agentAudioTrack?.audioTrack && audioEl.current) {



      agentAudioTrack.audioTrack.attach(audioEl.current);



    }



  }, [agentAudioTrack]);







  const isAgentSpeaking = agentParticipant && speakingParticipants.includes(agentParticipant);







  return (



    <div>



      <audio ref={audioEl} autoPlay />



      <div style={{ 



        width: '50px', 



        height: '50px', 



        borderRadius: '50%', 



        backgroundColor: isAgentSpeaking ? 'green' : 'red',



        transition: 'background-color 0.5s ease'



      }} />



      <button onClick={() => room.disconnect()}>Stop Agent</button>



    </div>



  );



}
