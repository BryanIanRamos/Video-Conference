// webrtc-helper.js - A simplified WebRTC wrapper for direct browser WebRTC API

class WebRTCPeer {
  constructor(options = {}) {
    this.initiator = options.initiator || false;
    this.stream = options.stream;
    this.listeners = {};
    this._queuedCandidates = [];
    this._connecting = false;
    this._hasRemoteStream = false;

    console.log(
      `[WebRTC] Creating peer connection (initiator: ${this.initiator})`
    );

    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
        {
          urls: "turn:global.turn.twilio.com:3478",
          username: "f4b4035eaa76f77e3423b4ca",
          credential: "adL8fjD+w/XYCmgV",
        },
      ],
      // Add these options to improve connection reliability
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };

    try {
      this.pc = new RTCPeerConnection(configuration);

      // Add stream tracks to the connection
      if (this.stream && this.stream.getTracks) {
        console.log(
          `[WebRTC] Adding ${
            this.stream.getTracks().length
          } local tracks to connection`
        );
        this.stream.getTracks().forEach((track) => {
          this.pc.addTrack(track, this.stream);
        });
      } else if (this.stream) {
        console.log(
          "[WebRTC] Stream provided but getTracks method not available"
        );
      } else {
        console.warn("[WebRTC] No media stream provided");
      }

      // Listen for ICE candidates
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(
            `[WebRTC] New ICE candidate: ${event.candidate.candidate.substring(
              0,
              50
            )}...`
          );
          // Include ICE candidate in the SDP
          this._signal({ type: "ice", candidate: event.candidate });
        } else {
          console.log("[WebRTC] All ICE candidates gathered");
        }
      };

      // ICE connection state changes
      this.pc.oniceconnectionstatechange = () => {
        console.log(
          "[WebRTC] ICE connection state:",
          this.pc.iceConnectionState
        );

        if (
          this.pc.iceConnectionState === "connected" ||
          this.pc.iceConnectionState === "completed"
        ) {
          console.log("[WebRTC] ✅ Connection established successfully!");
        } else if (this.pc.iceConnectionState === "failed") {
          console.error("[WebRTC] ❌ Connection failed");
          // Attempt ICE restart if connection fails
          if (this.initiator && this.pc.iceConnectionState === "failed") {
            console.log("[WebRTC] Attempting ICE restart...");
            this._createOffer({ iceRestart: true });
          }
        }
      };

      // Connection state changes
      this.pc.onconnectionstatechange = () => {
        console.log("[WebRTC] Connection state:", this.pc.connectionState);
        if (this.pc.connectionState === "failed") {
          console.error("[WebRTC] Connection has failed, may need to restart");
        }
      };

      // Listen for remote stream
      this.pc.ontrack = (event) => {
        console.log("[WebRTC] Remote track received:", event.track.kind);

        // Make sure we have a valid stream
        if (event.streams && event.streams[0]) {
          this._hasRemoteStream = true;

          if (this.listeners["stream"]) {
            this.listeners["stream"].forEach((cb) => {
              console.log("[WebRTC] Emitting stream event with remote stream");
              cb(event.streams[0]);
            });
          }
        } else {
          console.warn("[WebRTC] Received track but no associated stream");
        }
      };

      // Negotiation needed event
      this.pc.onnegotiationneeded = async () => {
        console.log("[WebRTC] Negotiation needed");
        if (this.initiator && !this._connecting) {
          await this._createOffer();
        }
      };

      // If initiator, create and send offer (will also happen via negotiationneeded)
      if (this.initiator) {
        // Small delay to ensure everything is initialized
        setTimeout(() => {
          this._createOffer();
        }, 100);
      }
    } catch (err) {
      console.error("[WebRTC] Error during constructor:", err);
    }
  }

  // Create and send an offer
  async _createOffer(options = {}) {
    try {
      console.log(
        "[WebRTC] Creating offer",
        options.iceRestart ? "(ICE restart)" : ""
      );
      this._connecting = true;

      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        ...options,
      };

      const offer = await this.pc.createOffer(offerOptions);
      console.log("[WebRTC] Setting local description (offer)");
      await this.pc.setLocalDescription(offer);

      // Small delay to ensure SDP is fully generated
      setTimeout(() => {
        if (this.pc.localDescription) {
          this._signal({ type: "sdp", sdp: this.pc.localDescription });
        } else {
          console.error("[WebRTC] Local description not set after timeout");
        }
      }, 50);
    } catch (err) {
      console.error("[WebRTC] Error creating offer:", err);
      this._connecting = false;

      if (this.listeners["error"]) {
        this.listeners["error"].forEach((cb) => cb(err));
      }
    }
  } // Handle incoming signal data
  async signal(data) {
    try {
      if (!data) {
        console.error("[WebRTC] Received null or undefined signal data");
        return;
      }

      console.log("[WebRTC] Received signal data:", data.type);

      // Handle SDP (offer or answer)
      if (data.type === "sdp") {
        const sdpType = data.sdp?.type || "unknown";
        console.log(`[WebRTC] Setting remote description (${sdpType})`);

        // Mark that we're in the process of connecting
        this._connecting = true;

        try {
          // Set the remote description
          await this.pc.setRemoteDescription(
            new RTCSessionDescription(data.sdp)
          );
          console.log(
            `[WebRTC] Remote description set successfully (${sdpType})`
          );

          // If we received an offer and we're not the initiator, create an answer
          if (data.sdp.type === "offer" && !this.initiator) {
            console.log("[WebRTC] Creating answer to offer");
            const answer = await this.pc.createAnswer();
            console.log("[WebRTC] Setting local description (answer)");
            await this.pc.setLocalDescription(answer);

            // Small delay to ensure SDP is fully generated
            setTimeout(() => {
              this._signal({ type: "sdp", sdp: this.pc.localDescription });
            }, 50);
          }

          // Process any queued ICE candidates now that we have a remote description
          this._processQueuedCandidates();
        } catch (sdpErr) {
          console.error("[WebRTC] Error setting remote description:", sdpErr);
          console.error("[WebRTC] SDP that caused error:", data.sdp);
        }
      }
      // Handle ICE candidate
      else if (data.type === "ice") {
        if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
          console.log("[WebRTC] Adding ICE candidate immediately");
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("[WebRTC] ICE candidate added successfully");
          } catch (iceErr) {
            console.error("[WebRTC] Error adding ICE candidate:", iceErr);
          }
        } else {
          console.log(
            "[WebRTC] Queueing ICE candidate (remote description not yet set)"
          );
          this._queuedCandidates.push(data.candidate);
        }
      } else {
        console.warn("[WebRTC] Received unknown signal type:", data.type);
      }
    } catch (err) {
      console.error("[WebRTC] Error processing signal:", err);
      console.error(err.stack);
    }
  }

  // Process any queued ICE candidates
  async _processQueuedCandidates() {
    if (!this._queuedCandidates || this._queuedCandidates.length === 0) {
      return;
    }

    if (!this.pc || !this.pc.remoteDescription) {
      console.warn(
        "[WebRTC] Cannot process queued candidates: no remote description set"
      );
      return;
    }

    console.log(
      `[WebRTC] Processing ${this._queuedCandidates.length} queued ICE candidates`
    );

    const candidates = [...this._queuedCandidates];
    this._queuedCandidates = []; // Clear the queue first to avoid race conditions

    for (const candidate of candidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC] Successfully added queued ICE candidate");
      } catch (err) {
        console.error("[WebRTC] Error adding queued ICE candidate:", err);

        // Add back to queue if remote description is suddenly not available
        if (!this.pc.remoteDescription) {
          console.log(
            "[WebRTC] Remote description lost, re-queueing candidate"
          );
          this._queuedCandidates.push(candidate);
          break;
        }
      }
    }

    console.log("[WebRTC] Finished processing queued candidates");
  }

  // Register event listeners
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  // Emit signal event
  _signal(data) {
    console.log("[WebRTC] Signaling:", data.type);
    if (this.listeners["signal"]) {
      this.listeners["signal"].forEach((cb) => cb(data));
    }
  }

  // Clean up
  destroy() {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.close();
      this.pc = null;
    }
    this._queuedCandidates = [];
    this.listeners = {};
  }
}

export default WebRTCPeer;
