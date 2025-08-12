import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Plus, MessageSquare } from "lucide-react";
import { playDialTone, playHangupSound } from "../utils/audioUtils";
import { frenchWaiterPrompt } from "../utils/promptLoader.js";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const localStream = useRef(null);
  const callTimerRef = useRef(null);

  const phoneNumber = "+33 4 93 38 12 34";

  // iOS audio initialization
  const initIOSAudio = async () => {
    try {
      // Resume audio context if suspended (iOS requirement)
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Create a silent audio buffer to unlock audio on iOS
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
    } catch (error) {
      console.log('iOS audio init error:', error);
    }
  };

  // Format call duration
  const formatCallDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start call timer
  const startCallTimer = () => {
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  // Stop call timer
  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallDuration(0);
  };

  async function startSession() {
    setIsCalling(true);

    // Initialize iOS audio before starting the call
    await initIOSAudio();
    playDialTone();

    // Simulate calling animation for 3 seconds
    setTimeout(async () => {
      setIsCalling(false);
      setIsSessionActive(true);
      startCallTimer();

      const tokenResponse = await fetch("/token");
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.client_secret.value;

      const pc = new RTCPeerConnection();

      // Create audio element for remote audio with iOS support
      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      audioElement.current.volume = 1.0;
      audioElement.current.playsInline = true; // Important for iOS
      audioElement.current.muted = false;
      audioElement.current.preload = "auto";
      audioElement.current.controls = false;

      // iOS-specific attributes
      audioElement.current.setAttribute("webkit-playsinline", "true");
      audioElement.current.setAttribute("playsinline", "true");

      pc.ontrack = (e) => {
        audioElement.current.srcObject = e.streams[0];

        // iOS-compatible audio play function
        const playAudio = async () => {
          try {
            // Ensure audio context is resumed
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
              await audioContext.resume();
            }

            // Try to play the audio
            await audioElement.current.play();
            console.log('Audio started successfully');
          } catch (error) {
            console.log('Audio play failed:', error);

            // For iOS, try different approaches
            if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
              // Try unmuting and playing again
              audioElement.current.muted = false;
              setTimeout(() => {
                audioElement.current.play().catch(console.error);
              }, 100);
            }
          }
        };

        playAudio();
      };

      // Get local microphone stream
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localStream.current = ms;
      pc.addTrack(ms.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      peerConnection.current = pc;
    }, 3000);
  }

  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    if (peerConnection.current) {
      peerConnection.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnection.current.close();
    }

    // Stop local stream
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }

    // Clean up audio element
    if (audioElement.current) {
      audioElement.current.srcObject = null;
      audioElement.current = null;
    }

    playHangupSound();
    stopCallTimer();
    setIsSessionActive(false);
    setIsCalling(false);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  function sendClientEvent(message) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      dataChannel.send(JSON.stringify(message));

      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
    }
  }

  function sendTextMessage(message) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

  // Handle mute functionality
  const handleMuteToggle = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Handle speaker functionality
  const handleSpeakerToggle = () => {
    if (audioElement.current) {
      if (isSpeakerOn) {
        audioElement.current.volume = 0.5; // Normal volume
      } else {
        audioElement.current.volume = 1.0; // Loud volume for speaker
      }
      setIsSpeakerOn(!isSpeakerOn);
    }
  };

  useEffect(() => {
    if (dataChannel) {
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }
        setEvents((prev) => [event, ...prev]);
      });

      dataChannel.addEventListener("open", () => {
        sendClientEvent({
          type: "response.create",
          response: {
            instructions: frenchWaiterPrompt,
          },
        });
      });
    }
  }, [dataChannel]);

  // Cleanup timer and audio on unmount
  useEffect(() => {
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }

      // Clean up audio streams
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }

      if (audioElement.current) {
        audioElement.current.srcObject = null;
      }

      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      {/* iPhone Frame */}
      <div className="relative">
        {/* iPhone Border */}
        <div className="w-80 h-[600px] bg-gray-900 rounded-[3rem] border-8 border-gray-800 shadow-2xl">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-b-3xl z-10"></div>

          {/* Screen Content */}
          <div className="w-full h-full bg-black rounded-[2rem] overflow-hidden relative">
            {/* Status Bar */}
            <div className="flex justify-between items-center px-6 pt-8 pb-4 text-white text-sm">
              <span>{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <div className="flex items-center gap-1">
                <div className="w-6 h-3 border border-white rounded-sm">
                  <div className="w-4 h-1 bg-white rounded-sm m-0.5"></div>
                </div>
                <span>100%</span>
              </div>
            </div>

            {/* Call Interface */}
            <div className="flex flex-col h-full px-6">
              {/* Call Info - Centered */}
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                {isCalling ? (
                  // Calling Animation
                  <div className="space-y-8">
                    <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
                      <Phone className="w-12 h-12 text-white animate-bounce" />
                    </div>
                    <div>
                      <div className="text-white text-2xl font-light mb-3">
                        {phoneNumber}
                      </div>
                      <div className="text-gray-400 text-base animate-pulse">
                        Appel en cours...
                      </div>
                    </div>
                  </div>
                ) : isSessionActive ? (
                  // Active Call
                  <div className="space-y-8">
                    <div>
                      <div className="text-white text-2xl font-light mb-3">
                        Restaurant Zuma
                      </div>
                      <div className="text-green-400 text-base">
                        {formatCallDuration(callDuration)}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Idle State
                  <div className="space-y-8">
                    <div>
                      <div className="text-white text-2xl font-light mb-3">
                        {phoneNumber}
                      </div>
                      <div className="text-gray-400 text-base">
                        Restaurant Zuma
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Call Controls */}
              <div className="pb-8">
                {isSessionActive && (
                  <div className="grid grid-cols-3 gap-8 mb-8">
                    {/* Mute */}
                    <button
                      onClick={handleMuteToggle}
                      className={`w-14 h-14 rounded-full flex items-center justify-center ${
                        isMuted ? 'bg-red-500' : 'bg-gray-700'
                      }`}
                    >
                      {isMuted ? (
                        <MicOff className="w-7 h-7 text-white" />
                      ) : (
                        <Mic className="w-7 h-7 text-white" />
                      )}
                    </button>

                    {/* Speaker */}
                    <button
                      onClick={handleSpeakerToggle}
                      className={`w-14 h-14 rounded-full flex items-center justify-center ${
                        isSpeakerOn ? 'bg-blue-500' : 'bg-gray-700'
                      }`}
                    >
                      {isSpeakerOn ? (
                        <Volume2 className="w-7 h-7 text-white" />
                      ) : (
                        <VolumeX className="w-7 h-7 text-white" />
                      )}
                    </button>

                    {/* Add Call */}
                    <button className="w-14 h-14 bg-gray-700 rounded-full flex items-center justify-center">
                      <Plus className="w-7 h-7 text-white" />
                    </button>
                  </div>
                )}

                {/* Main Call Button */}
                <div className="flex justify-center mb-6">
                  {isSessionActive ? (
                    <button
                      onClick={stopSession}
                      className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <PhoneOff className="w-10 h-10 text-white" />
                    </button>
                  ) : (
                    <button
                      onClick={startSession}
                      onTouchStart={startSession} // iOS touch support
                      disabled={isCalling}
                      className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                        isCalling
                          ? 'bg-gray-600 cursor-not-allowed'
                          : 'bg-green-500 hover:bg-green-600'
                      }`}
                    >
                      <Phone className="w-10 h-10 text-white" />
                    </button>
                  )}
                </div>

                {/* Keyboard Button (only when in call) */}
                {isSessionActive && (
                  <div className="flex justify-center">
                    <button className="w-14 h-14 bg-gray-700 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-7 h-7 text-white" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
