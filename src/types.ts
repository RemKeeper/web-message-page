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
  mimeType: string
  url?: string
}

export interface FileOffer {
  fileId: string
  name: string
  size: number
  mimeType: string
  sender: Peer
  timestamp: number
  available: boolean
  preview?: string
  state?: 'requesting' | 'receiving'
}

export type ServerEvent =
  | { type: 'welcome'; clientId: string; peers: Peer[] }
  | { type: 'peer-joined'; peer: Peer }
  | { type: 'peer-left'; peerId: string }
  | { type: 'chat'; id: string; text: string; sender: Peer; timestamp: number }
  | { type: 'file-offer'; fileId: string; name: string; size: number; mimeType: string; preview?: string; sender: Peer; timestamp: number }
  | { type: 'file-request'; fileId: string; requester: Peer }
  | { type: 'file-error'; fileId: string; message: string; sender: Peer }
  | { type: 'signal'; from: string; fromName: string; data: RTCSessionDescriptionInit | RTCIceCandidateInit }
