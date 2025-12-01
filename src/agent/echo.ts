import { defineAgent, JobContext, cli, WorkerOptions } from '@livekit/agents';
import { RoomEvent, Track, type Participant } from 'livekit-client';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const room = ctx.room;

    const onParticipantConnected = (participant: Participant) => {
      if (participant.isLocal) {
        return;
      }
      console.log(`User participant connected: ${participant.identity}`);

      const onTrackSubscribed = (track: Track) => {
        if (track.kind === Track.Kind.Audio) {
          console.log(`User audio track subscribed: ${track.sid}`);
          room.localParticipant.publishTrack(track, {
            name: 'echoed-audio',
          });
          console.log('>>> ECHOING USER AUDIO <<< ');
        }
      };

      participant.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
      participant.tracks.forEach(pub => {
        if (pub.track) {
          onTrackSubscribed(pub.track);
        }
      });
    };

    // Define the function to run once connected
    const onConnected = () => {
      console.log('--- ECHO AGENT CONNECTED ---');
      room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.participants.forEach(onParticipantConnected);
      console.log('Echo Agent is running and waiting for a user...');
    };

    // Register the event listener
    room.on(RoomEvent.Connected, onConnected);

    // Now, connect. The onConnected function will be called automatically.
    await ctx.connect();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));