import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Plus, MessageSquare } from "lucide-react";
import {
  playDialTone,
  playHangupSound,
  initializeAudioSystem,
  isIOS,
  setupIOSAudio,
  enhanceAudioStream
} from "../utils/audioUtils";
import { frenchWaiterPrompt } from "../utils/promptLoader.js";

// Helper to safely check for iOS during SSR
const safeIsIOS = () => {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return isIOS();
};

export default function App() {
  // Use useEffect for hydration safety
  const [isBrowser, setIsBrowser] = useState(false);

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const localStream = useRef(null);
  const callTimerRef = useRef(null);

  // Set isBrowser to true after component mounts (client-side only)
  useEffect(() => {
    setIsBrowser(true);
  }, []);

  const phoneNumber = "+33 4 93 38 12 34";

    // Simplified audio initialization
  const initAudio = async (userInitiated = true) => {
    try {
      // Initialize audio system with cross-platform support
      const success = await initializeAudioSystem(userInitiated);

      // Special handling for iOS
      if (safeIsIOS()) {
        try {
          await setupIOSAudio();
        } catch (iosError) {
          console.warn("iOS audio setup failed:", iosError);
          // Continue anyway
        }
      }

      setAudioInitialized(success);
      if (!success) {
        console.warn("Audio initialization failed");
        // Don't set error yet, as we can still try to proceed
      }

      return true; // Always return true to proceed with call
    } catch (error) {
      console.error('Audio context init error:', error);
      // Don't set error message yet, let's try to proceed anyway
      return true; // Still return true to proceed with call
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
    setAudioError(null);

    try {
      // Initialize audio with user interaction (button click)
      const audioReady = await initAudio(true);

      if (!audioReady) {
        console.warn("Audio system not initialized properly");
        // Continue anyway, but we've set the error state
      }

      // Play dial tone
      try {
        playDialTone();
      } catch (error) {
        console.warn('Dial tone failed:', error);
        // Non-critical error, continue with call
      }

      // Start call setup after dial tone completes (or after 3 seconds)
      setTimeout(async () => {
        try {
          setIsCalling(false);
          setIsSessionActive(true);
          startCallTimer();

          // Get token for OpenAI session
          const tokenResponse = await fetch("/token");
          const data = await tokenResponse.json();
          const EPHEMERAL_KEY = data.client_secret.value;

          // Create and configure RTCPeerConnection
          const pc = new RTCPeerConnection({
            // ICE servers configuration for better connectivity
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" }
            ],
            // For better mobile performance
            sdpSemantics: 'unified-plan',
            iceCandidatePoolSize: 10
          });

                    // Create simple audio element for remote audio
          audioElement.current = document.createElement("audio");
          audioElement.current.autoplay = true;
          audioElement.current.volume = 1.0;
          audioElement.current.muted = false;

          // Add iOS-specific attributes
          audioElement.current.setAttribute('playsinline', '');
          audioElement.current.setAttribute('webkit-playsinline', '');

          // Always add to DOM (helps on all platforms)
          // Check if we're in a browser environment first
          if (typeof document !== 'undefined') {
            document.body.appendChild(audioElement.current);
          }

                    // Handle incoming audio stream - simplified
          pc.ontrack = (e) => {
            console.log("Audio track received");

            if (audioElement.current) {
              audioElement.current.srcObject = e.streams[0];

              // Simple play with error handling
              audioElement.current.play()
                .then(() => console.log("Audio playback started"))
                .catch(err => {
                  console.error("Audio playback failed:", err);
                  setAudioError("Audio playback failed. Try clicking the screen.");

                  // Add a click handler to the document to try playing again
                  // (iOS requires user interaction)
                  const clickHandler = () => {
                    audioElement.current.play()
                      .then(() => {
                        console.log("Audio playback started after user interaction");
                        document.removeEventListener('click', clickHandler);
                      })
                      .catch(e => console.error("Audio play failed again:", e));
                  };

                  document.addEventListener('click', clickHandler, { once: true });
                });
            }
          };

                    // Get local microphone stream with error handling - simplified version
          try {
            const constraints = {
              audio: true
            };

            // Get the microphone stream
            const ms = await navigator.mediaDevices.getUserMedia(constraints);
            localStream.current = ms;

            // Add audio track to the connection
            if (ms && ms.getAudioTracks().length > 0) {
              const track = ms.getAudioTracks()[0];
              pc.addTrack(track, ms);
              console.log("Audio track added successfully");
            }
          } catch (micError) {
            console.error("Microphone access error:", micError);
            setAudioError("Could not access microphone. Please check permissions.");

            // Continue without microphone - user can still listen
          }

          // Create data channel for events
          const dc = pc.createDataChannel("oai-events", {
            ordered: true
          });
          setDataChannel(dc);

          // Create and send offer
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          await pc.setLocalDescription(offer);

          // Send offer to OpenAI
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

          // Process answer
          if (!sdpResponse.ok) {
            throw new Error(`API response error: ${sdpResponse.status}`);
          }

          const answer = {
            type: "answer",
            sdp: await sdpResponse.text(),
          };
          await pc.setRemoteDescription(answer);

          peerConnection.current = pc;

          // Add connection state monitoring
          pc.oniceconnectionstatechange = () => {
            console.log("ICE connection state:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected' ||
                pc.iceConnectionState === 'failed' ||
                pc.iceConnectionState === 'closed') {
              // Handle disconnection gracefully
              console.warn("ICE connection failed or closed");
            }
          };

        } catch (error) {
          console.error('Failed to start session:', error);
          setIsCalling(false);
          setIsSessionActive(false);
          setAudioError("Call setup failed: " + error.message);
        }
      }, 3000);

    } catch (error) {
      console.error('Session start error:', error);
      setIsCalling(false);
      setAudioError("Call setup error: " + error.message);
    }
  }

  async function stopSession() {
    // Play hangup sound
    try {
      playHangupSound();
    } catch (error) {
      console.warn('Hangup sound failed:', error);
    }

    // Close data channel
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (err) {
        console.warn("Error closing data channel:", err);
      }
    }

    // Close peer connection and stop tracks
    if (peerConnection.current) {
      try {
        // Stop all tracks from senders
        peerConnection.current.getSenders().forEach((sender) => {
          if (sender.track) {
            sender.track.stop();
          }
        });

        // Close the connection
        peerConnection.current.close();
      } catch (err) {
        console.warn("Error closing peer connection:", err);
      }
    }

    // Stop local stream tracks
    if (localStream.current) {
      try {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
      } catch (err) {
        console.warn("Error stopping local tracks:", err);
      }
    }

        // Clean up audio element
    if (audioElement.current) {
      try {
        audioElement.current.pause();
        audioElement.current.srcObject = null;

        // Remove from DOM
        if (audioElement.current.parentNode) {
          audioElement.current.parentNode.removeChild(audioElement.current);
        }

        audioElement.current = null;
      } catch (err) {
        console.warn("Error cleaning up audio element:", err);
      }
    }

    // Reset all state
    stopCallTimer();
    setIsSessionActive(false);
    setIsCalling(false);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setDataChannel(null);
    setAudioError(null);
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

      // Handle data channel errors
      dataChannel.addEventListener("error", (err) => {
        console.error("Data channel error:", err);
        setAudioError("Communication error. Please try again.");
      });

      // Handle data channel close
      dataChannel.addEventListener("close", () => {
        console.log("Data channel closed");
      });
    }
  }, [dataChannel]);

    // Add useEffect for handling audio initialization on component mount
  useEffect(() => {
    // Only run on client side
    if (isBrowser) {
      // Try to initialize audio system on component mount
      // This won't work on iOS until user interaction, but helps on other platforms
      initAudio(false).catch(console.error);

      // Detect if we're on iOS and show appropriate message
      if (safeIsIOS()) {
        console.log("iOS device detected - audio requires user interaction");
      }
    }
  }, [isBrowser]);

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
                      {isBrowser && safeIsIOS() && (
                        <div className="text-blue-400 text-xs mt-2">
                          iOS device detected
                        </div>
                      )}
                      {audioError && (
                        <div className="text-red-400 text-xs mt-2 max-w-[200px] mx-auto">
                          {audioError}
                        </div>
                      )}
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
                      {isBrowser && safeIsIOS() && (
                        <div className="text-blue-400 text-xs mt-2">
                          iOS device
                        </div>
                      )}
                      {audioError && (
                        <div className="text-red-400 text-xs mt-2 max-w-[200px] mx-auto">
                          {audioError}
                        </div>
                      )}
                      {isMuted && (
                        <div className="text-yellow-400 text-xs mt-1">
                          Microphone muted
                        </div>
                      )}
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
                      {isBrowser && safeIsIOS() && (
                        <div className="text-blue-400 text-xs mt-2">
                          iOS device detected
                        </div>
                      )}
                      {audioError && (
                        <div className="text-red-400 text-xs mt-2 max-w-[200px] mx-auto">
                          {audioError}
                        </div>
                      )}
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
