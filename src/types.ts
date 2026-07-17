export interface Peer {
  id: string
  name: string
}

export interface ChatMessage {
  id: string
  text: string
  sender: Peer
  timestamp: number
}

export interface FileProgress {
  id: string
  name: string
  size: number
  progress: number
  direction: 'sending' | 'receiving'
  peerName: string
  url?: string
}

export type ServerEvent =
  | { type: 'welcome'; clientId: string; peers: Peer[] }
  | { type: 'peer-joined'; peer: Peer }
  | { type: 'peer-left'; peerId: string }
  | { type: 'chat'; id: string; text: string; sender: Peer; timestamp: number }
  | { type: 'signal'; from: string; fromName: string; data: RTCSessionDescriptionInit | RTCIceCandidateInit }
