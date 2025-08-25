import Button from "@mui/material/Button";
import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

// Just a test component to check WebRTC functionality
const TestApp = () => {
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState("");
  const [mediaStream, setMediaStream] = useState(null);
  const videoRef = useRef(null);
  const socket = io.connect("http://localhost:5000");

  useEffect(() => {
    // Setup socket connection
    socket.on("connect", () => {
      setConnected(true);
      setSocketId(socket.id);
      console.log("Connected to server with ID:", socket.id);
    });

    // Get user media
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setMediaStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing media devices:", err);
      }
    };

    getMedia();

    return () => {
      // Cleanup
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h1 style={{ color: "white" }}>WebRTC Test</h1>
      <p style={{ color: "white" }}>
        Socket status: {connected ? "Connected" : "Disconnected"}
      </p>
      {socketId && <p style={{ color: "white" }}>Socket ID: {socketId}</p>}
      <div style={{ maxWidth: "500px", margin: "0 auto" }}>
        <div
          style={{
            border: "1px solid white",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%" }}
          />
        </div>
        <Button
          variant="contained"
          color="primary"
          style={{ marginTop: "20px" }}
          onClick={() => console.log("Media stream available:", !!mediaStream)}
        >
          Test Connection
        </Button>
      </div>
    </div>
  );
};

export default TestApp;
