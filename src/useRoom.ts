import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, FileProgress, Peer, ServerEvent } from './types'

const CHUNK_SIZE = 16 * 1024
const signalBase = import.meta.env.VITE_SIGNAL_URL || (
  import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.msg.rem.asia'
)

function sendSocketMessage(socket: WebSocket | null, message: unknown) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

interface IncomingFile {
  meta: { id: string; name: string; size: number; senderName: string }
  chunks: ArrayBuffer[]
  received: number
}

export function useRoom(roomId: string, name: string, onDisconnected: () => void) {
  const clientId = useRef(crypto.randomUUID())
  const socket = useRef<WebSocket | null>(null)
  const connections = useRef(new Map<string, RTCPeerConnection>())
  const channels = useRef(new Map<string, RTCDataChannel>())
  const incoming = useRef(new Map<string, IncomingFile>())
  const filesRef = useRef<FileProgress[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [files, setFiles] = useState<FileProgress[]>([])
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting')

  const sendSignal = useCallback((target: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    sendSocketMessage(socket.current, { type: 'signal', target, data })
  }, [])

  const updateFile = useCallback((id: string, patch: Partial<FileProgress>) => {
    setFiles((current) => current.map((file) => file.id === id ? { ...file, ...patch } : file))
  }, [])

  useEffect(() => { filesRef.current = files }, [files])

  const handleChannelMessage = useCallback((peer: Peer, event: MessageEvent) => {
    if (typeof event.data === 'string') {
      const packet = JSON.parse(event.data)
      if (packet.type === 'file-meta') {
        incoming.current.set(packet.id, { meta: { ...packet, senderName: peer.name }, chunks: [], received: 0 })
        setFiles((current) => [...current, {
          id: packet.id, name: packet.name, size: packet.size, progress: 0,
          direction: 'receiving', peerName: peer.name,
        }])
      } else if (packet.type === 'file-end') {
        const transfer = incoming.current.get(packet.id)
        if (!transfer) return
        const blob = new Blob(transfer.chunks)
        updateFile(packet.id, { progress: 100, url: URL.createObjectURL(blob) })
        incoming.current.delete(packet.id)
      }
      return
    }

    const view = event.data as ArrayBuffer
    const headerLength = new DataView(view).getUint16(0)
    const id = new TextDecoder().decode(view.slice(2, 2 + headerLength))
    const transfer = incoming.current.get(id)
    if (!transfer) return
    const chunk = view.slice(2 + headerLength)
    transfer.chunks.push(chunk)
    transfer.received += chunk.byteLength
    updateFile(id, { progress: Math.min(100, Math.round(transfer.received / transfer.meta.size * 100)) })
  }, [updateFile])

  const configureChannel = useCallback((peer: Peer, channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => channels.current.set(peer.id, channel)
    channel.onclose = () => channels.current.delete(peer.id)
    channel.onmessage = (event) => handleChannelMessage(peer, event)
  }, [handleChannelMessage])

  const createConnection = useCallback((peer: Peer) => {
    const existing = connections.current.get(peer.id)
    if (existing) return existing
    const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })
    connections.current.set(peer.id, connection)
    connection.onicecandidate = (event) => event.candidate && sendSignal(peer.id, event.candidate.toJSON())
    connection.ondatachannel = (event) => configureChannel(peer, event.channel)
    connection.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(connection.connectionState)) {
        connections.current.delete(peer.id)
        channels.current.delete(peer.id)
      }
    }
    return connection
  }, [configureChannel, sendSignal])

  const connectToPeer = useCallback(async (peer: Peer) => {
    const connection = createConnection(peer)
    const channel = connection.createDataChannel('files', { ordered: true })
    configureChannel(peer, channel)
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    sendSignal(peer.id, offer)
  }, [configureChannel, createConnection, sendSignal])

  const handleSignal = useCallback(async (event: Extract<ServerEvent, { type: 'signal' }>) => {
    const peer = { id: event.from, name: event.fromName }
    const connection = createConnection(peer)
    if ('type' in event.data && (event.data.type === 'offer' || event.data.type === 'answer')) {
      await connection.setRemoteDescription(event.data as RTCSessionDescriptionInit)
      if (event.data.type === 'offer') {
        const answer = await connection.createAnswer()
        await connection.setLocalDescription(answer)
        sendSignal(peer.id, answer)
      }
    } else {
      await connection.addIceCandidate(event.data as RTCIceCandidateInit)
    }
  }, [createConnection, sendSignal])

  useEffect(() => {
    const peerConnections = connections.current
    const transferredFiles = filesRef.current
    const url = new URL(`/rooms/${encodeURIComponent(roomId)}/connect`, signalBase)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('clientId', clientId.current)
    url.searchParams.set('name', name)
    const ws = new WebSocket(url)
    socket.current = ws

    ws.onopen = () => setStatus('online')
    ws.onclose = () => setStatus('offline')
    ws.onerror = () => setStatus('offline')
    ws.onmessage = async ({ data }) => {
      const event = JSON.parse(data) as ServerEvent
      if (event.type === 'welcome') {
        setPeers(event.peers)
        for (const peer of event.peers) await connectToPeer(peer)
      } else if (event.type === 'peer-joined') {
        setPeers((current) => current.some((peer) => peer.id === event.peer.id) ? current : [...current, event.peer])
      } else if (event.type === 'peer-left') {
        setPeers((current) => current.filter((peer) => peer.id !== event.peerId))
        connections.current.get(event.peerId)?.close()
        connections.current.delete(event.peerId)
        channels.current.delete(event.peerId)
      } else if (event.type === 'chat') {
        setMessages((current) => [...current, event])
      } else if (event.type === 'signal') {
        await handleSignal(event)
      }
    }

    return () => {
      ws.close()
      peerConnections.forEach((connection) => connection.close())
      peerConnections.clear()
      transferredFiles.forEach((file) => file.url && URL.revokeObjectURL(file.url))
    }
  // Room lifetime intentionally matches room/name values only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name])

  const sendMessage = (text: string) => {
    const id = crypto.randomUUID()
    sendSocketMessage(socket.current, { type: 'chat', id, text })
  }

  const sendFile = async (file: File, peerId: string) => {
    const channel = channels.current.get(peerId)
    const peer = peers.find((item) => item.id === peerId)
    if (!channel || channel.readyState !== 'open' || !peer) throw new Error('P2P 连接尚未就绪')
    const id = crypto.randomUUID()
    setFiles((current) => [...current, { id, name: file.name, size: file.size, progress: 0, direction: 'sending', peerName: peer.name }])
    channel.send(JSON.stringify({ type: 'file-meta', id, name: file.name, size: file.size }))
    let offset = 0
    const idBytes = new TextEncoder().encode(id)
    while (offset < file.size) {
      while (channel.bufferedAmount > 512 * 1024) await new Promise((resolve) => setTimeout(resolve, 40))
      const chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
      const packet = new Uint8Array(2 + idBytes.length + chunk.byteLength)
      new DataView(packet.buffer).setUint16(0, idBytes.length)
      packet.set(idBytes, 2)
      packet.set(new Uint8Array(chunk), 2 + idBytes.length)
      channel.send(packet)
      offset += chunk.byteLength
      updateFile(id, { progress: Math.round(offset / file.size * 100) })
    }
    channel.send(JSON.stringify({ type: 'file-end', id }))
  }

  return { clientId: clientId.current, messages, peers, files, status, sendMessage, sendFile, leave: onDisconnected }
}
