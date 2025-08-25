import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import AssignmentIcon from "@mui/icons-material/Assignment";
import PhoneIcon from "@mui/icons-material/Phone";
import React, { useEffect, useRef, useState } from "react";
import { CopyToClipboard } from "react-copy-to-clipboard";
import WebRTCPeer from "./webrtc-helper";
import io from "socket.io-client";
import "./App.css";

// Create the socket connection
const socket = io.connect("http://localhost:5000", {
  reconnectionAttempts: 5,
  timeout: 10000,
});

function AppWebRTC() {
  const [me, setMe] = useState("");
  const [stream, setStream] = useState();
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState();
  const [callAccepted, setCallAccepted] = useState(false);
  const [idToCall, setIdToCall] = useState("");
  const [callEnded, setCallEnded] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();
  const callRef = useRef();
  const [remoteStream, setRemoteStream] = useState(null);

  // Get available video input devices (cameras)
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setVideoDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedCamera) {
          setSelectedCamera(videoInputs[0].deviceId);
        }
      } catch (err) {
        setError("Could not enumerate devices: " + err.message);
      }
    };
    getDevices();
  }, [selectedCamera]);

  // Get user media stream (with selected camera)
  useEffect(() => {
    const getMedia = async () => {
      try {
        console.log("Requesting media permissions (720p@15fps)...");
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 15, max: 15 },
          },
          audio: true,
        };
        if (selectedCamera) {
          constraints.video.deviceId = { exact: selectedCamera };
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia(
          constraints
        );
        setStream(mediaStream);
        if (myVideo.current) {
          myVideo.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError(`Camera/microphone error: ${err.message}`);
      }
    };
    getMedia();
  }, [selectedCamera]);

  // Handle camera selection change
  const handleCameraChange = (e) => {
    setSelectedCamera(e.target.value);
  };

  // Socket event listeners and cleanup
  useEffect(() => {
    // Socket connection event
    socket.on("connect", () => {
      console.log("Socket connected");
      setSocketConnected(true);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setError(`Server connection error: ${err.message}`);
      setSocketConnected(false);
    });

    // Socket event listeners
    socket.on("me", (id) => {
      console.log("Received ID from server:", id);
      setMe(id);
    });

    socket.on("callUser", (data) => {
      console.log("Receiving call from:", data.from);
      setReceivingCall(true);
      setCaller(data.from);
      setName(data.name);

      console.log("Received signal data:", data.signal);
      setCallerSignal(data.signal);
      callRef.current = data;
    });

    // Setup callAccepted listener here so it's only added once
    socket.on("callAccepted", (signal) => {
      console.log("Call accepted, received signal:", signal);
      setCallAccepted(true);
      if (connectionRef.current) {
        console.log("Processing accepted call signal");
        connectionRef.current.signal(signal);
      } else {
        console.error("No connection reference when call was accepted");
      }
    });

    // Handle ICE candidate relay from remote peer
    socket.on("iceCandidate", (data) => {
      console.log("Received ICE candidate from remote peer");
      if (connectionRef.current && data.candidate) {
        connectionRef.current.signal({
          type: "ice",
          candidate: data.candidate,
        });
      }
    });

    // Handle call errors
    socket.on("callError", (data) => {
      console.error("Call error:", data.message);
      setError(`Call error: ${data.message}`);
      setCallEnded(true);
    });

    // Handle call ended
    socket.on("callEnded", (data) => {
      console.log("Call ended by", data?.from || "server");
      // Clean up locally without depending on outer endCall reference
      setCallEnded(true);
      setReceivingCall(false);
      setCallAccepted(false);
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }
      if (userVideo.current) {
        userVideo.current.srcObject = null;
      }
    });

    // Clean up function
    return () => {
      console.log("Cleaning up socket listeners");
      socket.off("me");
      socket.off("callUser");
      socket.off("callAccepted");
      socket.off("callError");
      socket.off("callEnded");
      socket.off("connect");
      socket.off("connect_error");
    };
  }, []);

  const callUser = (id) => {
    // Check if stream is available
    if (!stream) {
      console.error(
        "Stream is not available. Please check camera/microphone permissions."
      );
      setError("Camera/microphone not available");
      return;
    }

    // Check if socket is connected
    if (!socketConnected) {
      console.error("Socket not connected");
      setError("Not connected to signaling server");
      return;
    }

    console.log("Calling user:", id);
    setError(""); // Clear any previous errors

    const peer = new WebRTCPeer({
      initiator: true,
      stream: stream,
    });

    peer.on("signal", (data) => {
      if (data.type === "ice") {
        // Relay ICE candidate to remote peer
        socket.emit("iceCandidate", {
          to: id,
          candidate: data.candidate,
        });
      } else {
        // SDP offer/answer
        console.log("Generated signal data to send to peer", data);
        socket.emit("callUser", {
          userToCall: id,
          signalData: data,
          from: me,
          name: name || "Anonymous",
        });
      }
    });

    peer.on("stream", (remoteStream) => {
      console.log("Received stream from peer:", remoteStream.id);
      // Store remote stream in state so a later-mounted video element can receive it
      if (remoteStream && remoteStream !== stream) {
        setRemoteStream(remoteStream);
      } else if (remoteStream === stream) {
        console.warn("[WebRTC] Warning: remoteStream is the same as local stream!");
      }
    });

    peer.on("error", (err) => {
      console.error("WebRTC error:", err);
      setError(`WebRTC error: ${err.message || err}`);
    });

    // Store the peer connection
    connectionRef.current = peer;

    console.log("Call initiated, waiting for answer...");
  };

  const answerCall = () => {
    // Check if stream is available
    if (!stream) {
      console.error(
        "Stream is not available. Please check camera/microphone permissions."
      );
      setError("Camera/microphone not available");
      return;
    }

    // Check if we have a call to answer
    if (!callerSignal) {
      console.error("No caller signal to answer");
      setError("No incoming call to answer");
      return;
    }

    console.log("Answering call from:", caller);
    setCallAccepted(true);
    setError(""); // Clear any previous errors

    const peer = new WebRTCPeer({
      initiator: false,
      stream: stream,
    });

    peer.on("signal", (data) => {
      if (data.type === "ice") {
        // Relay ICE candidate to remote peer
        socket.emit("iceCandidate", {
          to: caller,
          candidate: data.candidate,
        });
      } else {
        // SDP answer
        console.log("Generated answer signal to send to caller", data);
        socket.emit("answerCall", { signal: data, to: caller });
      }
    });

    peer.on("stream", (remoteStream) => {
      console.log("Received stream from caller:", remoteStream.id);
      // Store remote stream in state to ensure the UI effect attaches it when ready
      if (remoteStream) {
        setRemoteStream(remoteStream);
      }
    });

    peer.on("error", (err) => {
      console.error("WebRTC error in answer:", err);
      setError(`WebRTC error: ${err.message || err}`);
    });

    console.log("Processing caller signal data");

    // Important: Make sure we have a valid signal to process
    if (callerSignal) {
      // Process the signal with a small delay to ensure the peer is fully initialized
      setTimeout(() => {
        console.log("Now processing caller signal:", callerSignal);
        peer.signal(callerSignal);
      }, 100);
    } else {
      console.error("No caller signal data to process");
      setError("Invalid call data");
    }

    connectionRef.current = peer;
  };

  const endCall = () => {
    console.log("Ending call");
    setCallEnded(true);
    setReceivingCall(false);
    setCallAccepted(false);

    // Notify the other peer if we have an active connection
    if (callAccepted && !callEnded) {
      socket.emit("endCall", { to: caller || idToCall });
    }

    // Clean up the connection
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }

    // Reset remote video
    if (userVideo.current) {
      userVideo.current.srcObject = null;
    }
  };

  // Attach remote stream to the video element when it becomes available
  useEffect(() => {
    if (!remoteStream || !userVideo.current) return;

    userVideo.current.srcObject = remoteStream;

    // Try to play; some browsers block autoplay with audio, so handle the promise
    const p = userVideo.current.play && userVideo.current.play();
    if (p && p.catch) {
      p.catch((err) => {
        console.warn("Remote video play() was blocked, muting and retrying", err);
        try {
          userVideo.current.muted = true;
          userVideo.current.play && userVideo.current.play().catch(() => {});
        } catch {
          /* ignore */
        }
      });
    }
  }, [remoteStream]);

  return (
    <>
      <h1 style={{ textAlign: "center", color: "#fff", marginTop: "20px" }}>
        Zoomish (WebRTC Direct)
      </h1>
      <div className="container">
        <div className="video-container">
          <div className="video">
            {stream && (
              <>
                <video
                  playsInline
                  muted
                  ref={myVideo}
                  autoPlay
                  style={{ width: "300px" }}
                />
                <p>Your Video</p>
              </>
            )}
          </div>
          <div className="video">
            {callAccepted && !callEnded ? (
              <>
                <video
                  playsInline
                  ref={userVideo}
                  autoPlay
                  style={{ width: "300px" }}
                />
                <p>Remote Video</p>
              </>
            ) : null}
          </div>
        </div>

        {error && (
          <div style={{ color: "red", margin: "10px 0", textAlign: "center" }}>
            {error}
          </div>
        )}

        <div className="myId">
          {videoDevices.length > 0 && (
            <div style={{ marginBottom: "1rem", width: "100%" }}>
              <label
                htmlFor="camera-select"
                style={{ color: "#fff", marginRight: 8 }}
              >
                Camera:
              </label>
              <select
                id="camera-select"
                value={selectedCamera}
                onChange={handleCameraChange}
                style={{ padding: "0.5rem", borderRadius: 8, minWidth: 180 }}
              >
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(-4)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <TextField
            id="filled-basic"
            label="Name"
            variant="filled"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ marginBottom: "20px" }}
          />
          <CopyToClipboard text={me} style={{ marginBottom: "2rem" }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AssignmentIcon fontSize="large" />}
              disabled={!me}
            >
              Copy ID
            </Button>
          </CopyToClipboard>

          <TextField
            id="filled-basic"
            label="ID to call"
            variant="filled"
            value={idToCall}
            onChange={(e) => setIdToCall(e.target.value)}
          />
          <div className="call-button">
            {callAccepted && !callEnded ? (
              <Button variant="contained" color="secondary" onClick={endCall}>
                End Call
              </Button>
            ) : (
              <IconButton
                color="primary"
                aria-label="call"
                onClick={() => callUser(idToCall)}
                disabled={!idToCall || !socketConnected}
              >
                <PhoneIcon fontSize="large" />
              </IconButton>
            )}
          </div>
        </div>
        <div>
          {receivingCall && !callAccepted ? (
            <div className="caller">
              <h1>{name || "Someone"} is calling...</h1>
              <Button variant="contained" color="primary" onClick={answerCall}>
                Answer
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default AppWebRTC;
