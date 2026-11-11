import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";
import { useRealtime } from "./hooks";
import type { CallKind, CallRecord, RealtimeEvent } from "./types";

type CallPhase = "idle" | "incoming" | "outgoing" | "connecting" | "active" | "ended";
type SignalType = "offer" | "answer" | "ice" | "state";
/** "user" is the front/self camera, "environment" is the rear camera on phones. */
type CameraFacing = "user" | "environment";

type CallContextValue = {
  phase: CallPhase;
  call: CallRecord | null;
  incoming: CallRecord | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  cameraOn: boolean;
  remoteCameraOn: boolean;
  cameraFacing: CameraFacing;
  canSwitchCamera: boolean;
  error: string | null;
  note: string | null;
  callVersion: number;
  startCall: (ticketId: number, kind: CallKind) => Promise<void>;
  acceptCall: (shareVideo?: boolean) => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  switchCamera: () => Promise<void>;
  clearError: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

function cameraConstraints(
  facing: CameraFacing,
  mode: "ideal" | "exact" = "ideal",
): MediaTrackConstraints {
  return {
    ...CAMERA_CONSTRAINTS,
    facingMode: mode === "exact" ? { exact: facing } : { ideal: facing },
  };
}

/**
 * Opens a stream for the requested lens. Mobile browsers honour facingMode;
 * desktop webcams ignore it, which is fine because the switch button is hidden
 * unless more than one video input exists.
 */
function openCameraStream(facing: CameraFacing, mode: "ideal" | "exact" = "ideal") {
  return navigator.mediaDevices.getUserMedia({ video: cameraConstraints(facing, mode) });
}

/**
 * Finds the lens on the other side of the device. Tries facingMode first, then
 * rotates to a different device id for browsers that ignore or misreport it.
 */
async function openOtherCameraTrack(
  facing: CameraFacing,
  current: MediaStreamTrack | null,
): Promise<MediaStreamTrack | null> {
  const currentId = current?.getSettings().deviceId ?? null;
  try {
    const stream = await openCameraStream(facing, "exact");
    const track = stream.getVideoTracks()[0] ?? null;
    const nextId = track?.getSettings().deviceId ?? null;
    if (track && currentId && nextId && nextId === currentId) {
      // Same physical lens: let the device-id fallback below find another one.
      stream.getTracks().forEach((item) => item.stop());
    } else {
      return track;
    }
  } catch {
    // Fall through to device rotation.
  }

  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "videoinput",
    );
    if (devices.length < 2) return null;
    const target =
      devices.find((device) => !currentId || device.deviceId !== currentId) ?? devices[0];
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { ...CAMERA_CONSTRAINTS, deviceId: { exact: target.deviceId } },
    });
    return stream.getVideoTracks()[0] ?? null;
  } catch {
    return null;
  }
}

async function hasMultipleCameras(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput").length > 1;
  } catch {
    return false;
  }
}

const ENDED_DISPLAY_MS = 2400;
const LIVE_PHASES: CallPhase[] = ["outgoing", "connecting", "active"];

type AcquiredMedia = {
  audioStream: MediaStream;
  cameraTrack: MediaStreamTrack | null;
  cameraError: string | null;
};

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function stopAcquiredMedia(media: AcquiredMedia | null): void {
  if (!media) return;
  stopStream(media.audioStream);
  media.cameraTrack?.stop();
}

/**
 * Camera and microphone need a secure context: https, or localhost.
 * Opening the app from another device over http://<LAN-IP> is blocked by the browser.
 */
export function callSecureContext() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const host =
    typeof window === "undefined" || !window.location.hostname
      ? "localhost"
      : window.location.hostname;
  return {
    secure:
      typeof window === "undefined" ||
      (window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia)),
    origin,
    localUrl: "http://localhost:5173",
    httpsUrl: `https://${host}:5174`,
  };
}

function mediaContextError(): string | null {
  const context = callSecureContext();
  if (!context.secure) {
    return (
      `Calls need a secure connection. This page is on ${context.origin || "an insecure address"}, ` +
      `so the browser blocks the camera and microphone. Open ${context.localUrl} on this computer, ` +
      `or ${context.httpsUrl} on this device and accept the certificate warning.`
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser can't access your microphone or camera.";
  }
  return null;
}

function audioErrorMessage(error: unknown): string {
  const name = (error as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Allow microphone access in your browser to start the call.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Check your device and try again.";
  }
  return errorMessage(error);
}

function cameraErrorMessage(error: unknown): string {
  const name = (error as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera in your browser, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device.";
  }
  return errorMessage(error);
}

/**
 * Every call negotiates audio and a video slot. A canvas track fills the video
 * slot until the local user turns their camera on, so each side decides
 * independently whether to share video.
 */
async function acquireMedia(
  shareVideo: boolean,
  facing: CameraFacing = "user",
): Promise<AcquiredMedia> {
  const contextIssue = mediaContextError();
  if (contextIssue) throw new Error(contextIssue);

  if (shareVideo) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: cameraConstraints(facing),
      });
      return {
        audioStream: stream,
        cameraTrack: stream.getVideoTracks()[0] ?? null,
        cameraError: null,
      };
    } catch (error) {
      // The camera may be missing or blocked. Keep the call usable with voice.
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { audioStream: audio, cameraTrack: null, cameraError: cameraErrorMessage(error) };
      } catch (audioError) {
        throw new Error(audioErrorMessage(audioError));
      }
    }
  }

  try {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { audioStream: audio, cameraTrack: null, cameraError: null };
  } catch (error) {
    throw new Error(audioErrorMessage(error));
  }
}

function createPlaceholderVideoTrack(): MediaStreamTrack | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function") return null;
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const stream = canvas.captureStream(1);
  return stream.getVideoTracks()[0] ?? null;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [call, setCall] = useState<CallRecord | null>(null);
  const [incoming, setIncoming] = useState<CallRecord | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [remoteCameraOn, setRemoteCameraOn] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("user");
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [callVersion, setCallVersion] = useState(0);

  const phaseRef = useRef<CallPhase>("idle");
  const callRef = useRef<CallRecord | null>(null);
  const incomingRef = useRef<CallRecord | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const placeholderTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const cameraOnRef = useRef(false);
  const facingRef = useRef<CameraFacing>("user");
  const switchingCameraRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);
  const pendingSignalsRef = useRef<RealtimeEvent[]>([]);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const resetTimerRef = useRef<number | null>(null);

  function setPhaseSafe(next: CallPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function setCameraState(next: boolean) {
    cameraOnRef.current = next;
    setCameraOn(next);
  }

  function setFacing(next: CameraFacing) {
    facingRef.current = next;
    setCameraFacing(next);
  }

  function refreshCameraCapability() {
    void hasMultipleCameras().then((multiple) => {
      if (phaseRef.current !== "idle") setCanSwitchCamera(multiple);
    });
  }

  function refreshPreview() {
    const audio = audioStreamRef.current;
    if (!audio) {
      localStreamRef.current = null;
      setLocalStream(null);
      return;
    }
    const tracks = [...audio.getAudioTracks()];
    if (cameraTrackRef.current) tracks.push(cameraTrackRef.current);
    const preview = new MediaStream(tracks);
    localStreamRef.current = preview;
    setLocalStream(preview);
  }

  function cleanup() {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    pendingSignalsRef.current = [];
    pendingIceRef.current = [];
    try {
      pcRef.current?.close();
    } catch {
      // Ignore teardown errors.
    }
    pcRef.current = null;
    stopStream(audioStreamRef.current);
    cameraTrackRef.current?.stop();
    placeholderTrackRef.current?.stop();
    audioStreamRef.current = null;
    cameraTrackRef.current = null;
    placeholderTrackRef.current = null;
    videoSenderRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCameraState(false);
    setRemoteCameraOn(false);
    setCanSwitchCamera(false);
    switchingCameraRef.current = false;
    roleRef.current = null;
  }

  function resetCall() {
    cleanup();
    callRef.current = null;
    incomingRef.current = null;
    setCall(null);
    setIncoming(null);
    setMicOn(true);
    setError(null);
    setNote(null);
    setPhaseSafe("idle");
  }

  function finishCall(message: string) {
    cleanup();
    incomingRef.current = null;
    setIncoming(null);
    setNote(message);
    setPhaseSafe("ended");
    setCallVersion((value) => value + 1);
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      if (phaseRef.current === "ended") {
        callRef.current = null;
        setCall(null);
        setNote(null);
        setPhaseSafe("idle");
      }
    }, ENDED_DISPLAY_MS);
  }

  function sendSignal(type: SignalType, payload: unknown) {
    const current = callRef.current;
    if (!current) return;
    void api.post(`/api/calls/${current.id}/signal`, { type, payload }).catch((err) => {
      setError(errorMessage(err));
    });
  }

  function sendCameraState() {
    sendSignal("state", { cameraOn: cameraOnRef.current });
  }

  function flushIce(pc: RTCPeerConnection) {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) {
      void pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
    }
  }

  async function applySignal(pc: RTCPeerConnection, event: RealtimeEvent) {
    if (!event.payload) return;
    if (event.signalType === "offer") {
      await pc.setRemoteDescription(
        new RTCSessionDescription(event.payload as RTCSessionDescriptionInit),
      );
      flushIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal("answer", answer);
      return;
    }
    if (event.signalType === "answer") {
      await pc.setRemoteDescription(
        new RTCSessionDescription(event.payload as RTCSessionDescriptionInit),
      );
      flushIce(pc);
      return;
    }
    if (event.signalType === "ice") {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(event.payload as RTCIceCandidateInit));
      } else {
        pendingIceRef.current.push(event.payload as RTCIceCandidateInit);
      }
    }
  }

  function createPeer(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const audio = audioStreamRef.current;
    if (audio) {
      for (const track of audio.getAudioTracks()) pc.addTrack(track, audio);
    }

    // Reserve a video slot for this user. A black canvas track keeps the slot
    // open while the camera is off; replaceTrack swaps in the real camera later,
    // so no renegotiation is needed when either side toggles their video.
    const placeholder = createPlaceholderVideoTrack();
    placeholderTrackRef.current = placeholder;
    const initialVideo = cameraTrackRef.current ?? placeholder;
    const videoTransceiver = initialVideo
      ? pc.addTransceiver(initialVideo, { direction: "sendrecv" })
      : pc.addTransceiver("video", { direction: "sendrecv" });
    videoSenderRef.current = videoTransceiver.sender;

    remoteStreamRef.current = null;

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal("ice", event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const existing = remoteStreamRef.current?.getTracks() ?? [];
      if (existing.includes(event.track)) return;
      const next = new MediaStream([...existing, event.track]);
      remoteStreamRef.current = next;
      setRemoteStream(next);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (phaseRef.current !== "active") {
          setNote(null);
          setPhaseSafe("active");
        }
        // State signals are tiny and safe to repeat; this recovers a missed one.
        sendCameraState();
      } else if (pc.connectionState === "failed") {
        const current = callRef.current;
        if (current) void api.post(`/api/calls/${current.id}/end`).catch(() => undefined);
        setError("The call connection failed. Check your network and try again.");
        finishCall("The call could not connect.");
      }
    };
    pcRef.current = pc;
    return pc;
  }

  async function handleSignal(event: RealtimeEvent) {
    const current = callRef.current;
    if (!current || event.callId !== current.id) return;

    if (event.signalType === "state") {
      const payload = event.payload as { cameraOn?: unknown } | null | undefined;
      if (payload && typeof payload.cameraOn === "boolean") {
        setRemoteCameraOn(payload.cameraOn);
      }
      return;
    }

    const pc = pcRef.current;
    if (!pc) {
      if (roleRef.current === "callee" && event.signalType === "offer" && audioStreamRef.current) {
        const peer = createPeer();
        sendCameraState();
        await applySignal(peer, event);
        const queued = pendingSignalsRef.current;
        pendingSignalsRef.current = [];
        for (const queuedEvent of queued) await applySignal(peer, queuedEvent);
      } else {
        pendingSignalsRef.current.push(event);
      }
      return;
    }
    await applySignal(pc, event);
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    switch (event.type) {
      case "call:incoming": {
        if (!event.call) return;
        if (phaseRef.current !== "idle") {
          void api.post(`/api/calls/${event.call.id}/decline`).catch(() => undefined);
          return;
        }
        incomingRef.current = event.call;
        setIncoming(event.call);
        setError(null);
        setNote(null);
        setCallVersion((value) => value + 1);
        setPhaseSafe("incoming");
        return;
      }
      case "call:accepted": {
        if (!event.call || callRef.current?.id !== event.call.id) {
          // Another tab of the same user answered this call.
          if (event.call && incomingRef.current?.id === event.call.id) {
            incomingRef.current = null;
            setIncoming(null);
            setNote(null);
            setPhaseSafe("idle");
            setCallVersion((value) => value + 1);
          }
          return;
        }
        callRef.current = event.call;
        setCall(event.call);
        setCallVersion((value) => value + 1);
        if (roleRef.current !== "caller") return;
        setPhaseSafe("connecting");
        if (!audioStreamRef.current) return;
        const pc = createPeer();
        sendCameraState();
        void (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal("offer", offer);
        })().catch((err) => {
          setError(errorMessage(err));
          void api.post(`/api/calls/${event.call!.id}/end`).catch(() => undefined);
          finishCall("The call could not connect.");
        });
        return;
      }
      case "call:declined": {
        const id = event.callId ?? event.call?.id;
        if (callRef.current?.id !== id && incomingRef.current?.id !== id) return;
        if (event.call) {
          callRef.current = event.call;
          setCall(event.call);
        }
        finishCall("Call declined.");
        return;
      }
      case "call:ended": {
        const id = event.callId ?? event.call?.id;
        if (callRef.current?.id !== id && incomingRef.current?.id !== id) return;
        if (event.call) {
          callRef.current = event.call;
          setCall(event.call);
        }
        finishCall(event.reason === "missed" ? "Missed call." : "Call ended.");
        return;
      }
      case "call:signal": {
        void handleSignal(event).catch((err) => setError(errorMessage(err)));
        return;
      }
      default:
        return;
    }
  }

  useRealtime(handleRealtimeEvent, Boolean(user));

  useEffect(() => {
    if (!user) resetCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCall(ticketId: number, kind: CallKind) {
    if (phaseRef.current !== "idle") return;
    setError(null);
    setNote(null);
    setMicOn(true);
    setCameraState(false);
    setRemoteCameraOn(false);
    setFacing("user");
    setPhaseSafe("connecting");
    let media: AcquiredMedia | null = null;
    try {
      media = await acquireMedia(kind === "video", facingRef.current);
      // Read through a widened value: the ref can change while the prompt is open.
      if ((phaseRef.current as CallPhase) !== "connecting") {
        // The user cancelled while the browser was asking for device access.
        stopAcquiredMedia(media);
        return;
      }
      audioStreamRef.current = media.audioStream;
      cameraTrackRef.current = media.cameraTrack;
      setCameraState(Boolean(media.cameraTrack));
      if (media.cameraTrack) refreshCameraCapability();
      refreshPreview();
      if (media.cameraError) setError(media.cameraError);

      const response = await api.post<{ call: CallRecord }>("/api/calls", { ticketId, kind });
      if ((phaseRef.current as CallPhase) !== "connecting") {
        // Cancelled while the call was being created on the server.
        stopAcquiredMedia(media);
        audioStreamRef.current = null;
        cameraTrackRef.current = null;
        setLocalStream(null);
        void api.post(`/api/calls/${response.call.id}/end`).catch(() => undefined);
        return;
      }
      callRef.current = response.call;
      setCall(response.call);
      roleRef.current = "caller";
      setPhaseSafe("outgoing");
      setCallVersion((value) => value + 1);
    } catch (err) {
      stopAcquiredMedia(media);
      cleanup();
      callRef.current = null;
      setCall(null);
      setPhaseSafe("idle");
      setError(errorMessage(err));
    }
  }

  async function acceptCall(shareVideo = false) {
    const pending = incomingRef.current;
    if (!pending) return;
    setError(null);
    setNote(null);
    setCameraState(false);
    setRemoteCameraOn(false);
    setFacing("user");
    setPhaseSafe("connecting");
    let media: AcquiredMedia | null = null;
    try {
      media = await acquireMedia(shareVideo, facingRef.current);
      if (!incomingRef.current || phaseRef.current !== "connecting") {
        // The call was cancelled or declined while we waited for devices.
        stopAcquiredMedia(media);
        return;
      }
      audioStreamRef.current = media.audioStream;
      cameraTrackRef.current = media.cameraTrack;
      setCameraState(Boolean(media.cameraTrack));
      if (media.cameraTrack) refreshCameraCapability();
      refreshPreview();
      if (media.cameraError) setError(media.cameraError);

      callRef.current = pending;
      incomingRef.current = null;
      setIncoming(null);
      setCall(pending);
      roleRef.current = "callee";
      setMicOn(true);
      const response = await api.post<{ call: CallRecord }>(`/api/calls/${pending.id}/accept`);
      callRef.current = response.call;
      setCall(response.call);
      setCallVersion((value) => value + 1);
    } catch (err) {
      stopAcquiredMedia(media);
      cleanup();
      callRef.current = null;
      setCall(null);
      setPhaseSafe("idle");
      setError(errorMessage(err));
    }
  }

  async function declineCall() {
    const pending = incomingRef.current;
    if (!pending) return;
    incomingRef.current = null;
    setIncoming(null);
    setPhaseSafe("idle");
    setCallVersion((value) => value + 1);
    try {
      await api.post(`/api/calls/${pending.id}/decline`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function endCall() {
    const current = callRef.current;
    if (!current) {
      if (incomingRef.current) await declineCall();
      else resetCall();
      return;
    }
    const callId = current.id;
    finishCall("Call ended.");
    try {
      await api.post(`/api/calls/${callId}/end`);
    } catch {
      // The other side may have already ended the call.
    }
  }

  function toggleMic() {
    const stream = audioStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
  }

  async function toggleCamera() {
    const sender = videoSenderRef.current;

    if (cameraOnRef.current) {
      const track = cameraTrackRef.current;
      cameraTrackRef.current = null;
      if (sender) {
        await sender.replaceTrack(placeholderTrackRef.current).catch(() => undefined);
      }
      track?.stop();
      setCameraState(false);
      refreshPreview();
      sendCameraState();
      return;
    }

    try {
      const cameraStream = await openCameraStream(facingRef.current);
      const track = cameraStream.getVideoTracks()[0];
      if (!track) throw new Error("No camera was found on this device.");
      if (!LIVE_PHASES.includes(phaseRef.current)) {
        // The call ended while the browser was asking for camera access.
        track.stop();
        return;
      }
      cameraTrackRef.current = track;
      if (sender) {
        try {
          await sender.replaceTrack(track);
        } catch (replaceError) {
          cameraTrackRef.current = null;
          track.stop();
          throw replaceError;
        }
      }
      setCameraState(true);
      refreshCameraCapability();
      refreshPreview();
      setError(null);
      sendCameraState();
    } catch (err) {
      setError(cameraErrorMessage(err));
    }
  }

  async function switchCamera() {
    if (switchingCameraRef.current) return;
    const nextFacing: CameraFacing = facingRef.current === "user" ? "environment" : "user";

    // Camera is off: just remember the choice for when it is turned on.
    if (!cameraOnRef.current) {
      setFacing(nextFacing);
      return;
    }

    switchingCameraRef.current = true;
    const sender = videoSenderRef.current;
    const previous = cameraTrackRef.current;
    try {
      const track = await openOtherCameraTrack(nextFacing, previous);
      if (!track) throw new Error("No other camera was found on this device.");
      if (!LIVE_PHASES.includes(phaseRef.current) || !cameraOnRef.current) {
        // The call ended or the camera was turned off while switching.
        track.stop();
        return;
      }
      try {
        if (sender) await sender.replaceTrack(track);
      } catch (replaceError) {
        track.stop();
        throw replaceError;
      }
      cameraTrackRef.current = track;
      previous?.stop();
      setFacing(nextFacing);
      refreshPreview();
      setError(null);
    } catch (err) {
      setError(cameraErrorMessage(err));
    } finally {
      switchingCameraRef.current = false;
    }
  }

  const value = useMemo<CallContextValue>(
    () => ({
      phase,
      call,
      incoming,
      localStream,
      remoteStream,
      micOn,
      cameraOn,
      remoteCameraOn,
      cameraFacing,
      canSwitchCamera,
      error,
      note,
      callVersion,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMic,
      toggleCamera,
      switchCamera,
      clearError: () => setError(null),
    }),
    // Handlers read refs and latest state, so recompute only when displayed state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      phase,
      call,
      incoming,
      localStream,
      remoteStream,
      micOn,
      cameraOn,
      remoteCameraOn,
      cameraFacing,
      canSwitchCamera,
      error,
      note,
      callVersion,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay selfId={user?.id ?? null} />
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used inside CallProvider");
  return context;
}

function CallVideo({
  stream,
  muted,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

function useCallDuration(call: CallRecord | null, active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active || !call?.answeredAt) {
      setSeconds(0);
      return;
    }
    const start = new Date(call.answeredAt).getTime();
    const tick = () => setSeconds(Math.max(0, Math.round((Date.now() - start) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [call?.answeredAt, active]);
  return seconds;
}

function CallOverlay({ selfId }: { selfId: number | null }) {
  const {
    phase,
    call,
    incoming,
    localStream,
    remoteStream,
    micOn,
    cameraOn,
    remoteCameraOn,
    cameraFacing,
    canSwitchCamera,
    error,
    note,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCamera,
    switchCamera,
    clearError,
  } = useCall();

  const active = phase === "active";
  const duration = useCallDuration(call, active);
  const other = call ? (call.caller.id === selfId ? call.callee : call.caller) : null;
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Remote audio plays through its own element for both voice and video calls.
  // Without it a voice call has no media element at all, so nobody hears anything.
  useEffect(() => {
    const element = remoteAudioRef.current;
    if (!element) return;
    element.srcObject = remoteStream;
    if (!remoteStream) {
      setAudioBlocked(false);
      return;
    }
    const attempt = () => {
      element
        .play()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    };
    attempt();
    remoteStream.addEventListener("addtrack", attempt);
    return () => {
      remoteStream.removeEventListener("addtrack", attempt);
      element.srcObject = null;
    };
    // Re-run when the panel mounts: the first track can arrive before the
    // audio element exists for the current phase.
  }, [remoteStream, phase]);

  const enableSound = () => {
    const element = remoteAudioRef.current;
    if (!element) return;
    void element
      .play()
      .then(() => setAudioBlocked(false))
      .catch(() => setAudioBlocked(true));
  };

  if (phase === "idle") {
    if (!error) return null;
    return (
      <div className="call-toast call-toast-error" role="alert">
        <PhoneOff size={16} />
        <span>{error}</span>
        <button type="button" onClick={clearError} aria-label="Dismiss call error">
          ×
        </button>
      </div>
    );
  }

  if (phase === "incoming" && incoming) {
    return (
      <div className="call-toast call-toast-incoming" role="dialog" aria-label="Incoming call">
        <span className="call-toast-icon is-ringing">
          <PhoneIncoming size={18} />
        </span>
        <div className="call-toast-body">
          <strong>{incoming.caller.name}</strong>
          <span>
            Incoming {incoming.kind === "video" ? "video" : "voice"} call
            {incoming.ticketRef ? ` · ${incoming.ticketRef}` : ""}
          </span>
        </div>
        <div className="call-toast-actions">
          <button
            type="button"
            className="call-action call-action-decline"
            onClick={() => void declineCall()}
            aria-label="Decline call"
            title="Decline"
          >
            <PhoneOff size={16} />
          </button>
          <button
            type="button"
            className="call-action call-action-accept"
            onClick={() => void acceptCall(false)}
            aria-label="Answer with voice only"
            title="Answer with voice only"
          >
            <Phone size={16} />
          </button>
          {incoming.kind === "video" ? (
            <button
              type="button"
              className="call-action call-action-accept"
              onClick={() => void acceptCall(true)}
              aria-label="Answer with video"
              title="Answer with video"
            >
              <Video size={16} />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="call-panel call-panel-ended" role="status">
        <div className="call-ended-body">
          <span className="call-ended-icon">
            <PhoneOff size={20} />
          </span>
          <div>
            <strong>{note ?? "Call ended."}</strong>
            {call?.durationSeconds != null ? (
              <span className="small muted">{formatDuration(call.durationSeconds)}</span>
            ) : null}
          </div>
        </div>
        {error ? <p className="call-error">{error}</p> : null}
      </div>
    );
  }

  const connecting = phase === "connecting" || phase === "outgoing";
  const statusText = connecting
    ? phase === "outgoing"
      ? `Calling ${other?.name ?? "the other person"}…`
      : "Connecting…"
    : note ?? "Connected";

  const remoteHasVideo = Boolean(remoteStream?.getVideoTracks().length);
  const showRemoteVideo = remoteCameraOn && remoteHasVideo;
  const showVideoStage = showRemoteVideo || (cameraOn && Boolean(localStream));
  const placeholderStatus = active
    ? remoteCameraOn
      ? "Camera on"
      : "Connected · camera off"
    : statusText;

  return (
    <div
      className={`call-panel ${showVideoStage ? "is-video" : "is-audio"}`}
      role="dialog"
      aria-label="Active call"
    >
      <audio ref={remoteAudioRef} className="call-audio" autoPlay playsInline />
      <div className="call-stage">
        {showRemoteVideo && remoteStream ? (
          <CallVideo stream={remoteStream} muted className="call-remote-video" />
        ) : (
          <div className="call-placeholder">
            <span className={`call-avatar ${connecting ? "is-pulsing" : ""}`}>
              {connecting ? <LoaderCircle size={22} className="spin" /> : <Phone size={22} />}
            </span>
            <strong>{other?.name ?? "SupportIQ call"}</strong>
            <span>{placeholderStatus}</span>
            {active ? <span className="call-timer">{formatDuration(duration)}</span> : null}
          </div>
        )}

        {showRemoteVideo ? (
          <div className="call-stage-top">
            <span className="call-stage-name">{other?.name}</span>
            {active ? <span className="call-timer">{formatDuration(duration)}</span> : null}
          </div>
        ) : null}

        {cameraOn && localStream ? (
          <CallVideo stream={localStream} muted className="call-local-video" />
        ) : null}

        {audioBlocked ? (
          <button type="button" className="call-sound-prompt" onClick={enableSound}>
            <Volume2 size={15} />
            Tap to enable sound
          </button>
        ) : null}
      </div>

      <div className="call-controls">
        <button
          type="button"
          className={`call-control ${micOn ? "" : "is-off"}`.trim()}
          onClick={toggleMic}
          aria-pressed={!micOn}
          title={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          <span>{micOn ? "Mute" : "Unmute"}</span>
        </button>

        <button
          type="button"
          className={`call-control ${cameraOn ? "" : "is-off"}`.trim()}
          onClick={() => void toggleCamera()}
          aria-pressed={!cameraOn}
          title={cameraOn ? "Turn my camera off" : "Turn my camera on"}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
          <span>{cameraOn ? "Camera" : "Camera off"}</span>
        </button>

        {cameraOn && canSwitchCamera ? (
          <button
            type="button"
            className="call-control"
            onClick={() => void switchCamera()}
            title={
              cameraFacing === "user" ? "Switch to back camera" : "Switch to front camera"
            }
            aria-label={
              cameraFacing === "user" ? "Switch to back camera" : "Switch to front camera"
            }
          >
            <SwitchCamera size={18} />
            <span>Flip</span>
          </button>
        ) : null}

        <button
          type="button"
          className="call-control call-control-end"
          onClick={() => void endCall()}
          title="End call"
        >
          <PhoneOff size={18} />
          <span>End</span>
        </button>
      </div>

      {error ? <p className="call-error">{error}</p> : null}
    </div>
  );
}
