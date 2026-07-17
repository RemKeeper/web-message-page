import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, FileOffer, FileProgress, Peer, ServerEvent } from './types'

const CHUNK_SIZE = 16 * 1024
export const MAX_IMAGE_SIZE = 90 * 1024 * 1024
const signalBase = import.meta.env.VITE_SIGNAL_URL || (
  import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.msg.rem.asia'
)

function sendSocketMessage(socket: WebSocket | null, message: unknown) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

interface IncomingFile {
  meta: { id: string; name: string; size: number; mimeType: string; senderName: string }
  chunks: ArrayBuffer[]
  received: number
}

export function useRoom(roomId: string, name: string, onDisconnected: () => void) {
  const clientId = useRef(crypto.randomUUID())
  const socket = useRef<WebSocket | null>(null)
  const connections = useRef(new Map<string, RTCPeerConnection>())
  const channels = useRef(new Map<string, RTCDataChannel>())
  const incoming = useRef(new Map<string, IncomingFile>())
  const publishedFiles = useRef(new Map<string, File>())
  const offersRef = useRef<FileOffer[]>([])
  const filesRef = useRef<FileProgress[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [files, setFiles] = useState<FileProgress[]>([])
  const [fileOffers, setFileOffers] = useState<FileOffer[]>([])
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting')

  const sendSignal = useCallback((target: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    sendSocketMessage(socket.current, { type: 'signal', target, data })
  }, [])

  const updateFile = useCallback((id: string, patch: Partial<FileProgress>) => {
    setFiles((current) => current.map((file) => file.id === id ? { ...file, ...patch } : file))
  }, [])

  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => { offersRef.current = fileOffers }, [fileOffers])

  const handleChannelMessage = useCallback((peer: Peer, event: MessageEvent) => {
    if (typeof event.data === 'string') {
      const packet = JSON.parse(event.data)
      if (packet.type === 'file-meta') {
        incoming.current.set(packet.id, { meta: { ...packet, senderName: peer.name }, chunks: [], received: 0 })
        setFileOffers((current) => current.map((offer) => offer.fileId === packet.offerId ? { ...offer, state: 'receiving' } : offer))
        setFiles((current) => [...current, {
          id: packet.id, name: packet.name, size: packet.size, progress: 0,
          direction: 'receiving', peerName: peer.name, mimeType: packet.mimeType || 'application/octet-stream',
        }])
      } else if (packet.type === 'file-end') {
        const transfer = incoming.current.get(packet.id)
        if (!transfer) return
        const blob = new Blob(transfer.chunks, { type: transfer.meta.mimeType })
        updateFile(packet.id, { progress: 100, url: URL.createObjectURL(blob) })
        setFileOffers((current) => current.map((offer) => offer.fileId === packet.offerId ? { ...offer, state: undefined } : offer))
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

  const transferFile = useCallback(async (file: File, peer: Peer, offerId?: string) => {
    let channel = channels.current.get(peer.id)
    const deadline = Date.now() + 10_000
    while ((!channel || channel.readyState !== 'open') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      channel = channels.current.get(peer.id)
    }
    if (!channel || channel.readyState !== 'open') throw new Error(`无法连接到 ${peer.name}`)

    const id = crypto.randomUUID()
    setFiles((current) => [...current, { id, name: file.name, size: file.size, progress: 0, direction: 'sending', peerName: peer.name, mimeType: file.type || 'application/octet-stream' }])
    channel.send(JSON.stringify({ type: 'file-meta', id, offerId, name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream' }))
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
    channel.send(JSON.stringify({ type: 'file-end', id, offerId }))
  }, [updateFile])

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
    ws.onmessage = ({ data }) => {
      void (async () => {
        try {
          const event = JSON.parse(data) as ServerEvent
          if (event.type === 'welcome') {
            setPeers(event.peers)
            for (const peer of event.peers) await connectToPeer(peer)
          } else if (event.type === 'peer-joined') {
            setPeers((current) => current.some((peer) => peer.id === event.peer.id) ? current : [...current, event.peer])
            for (const offer of offersRef.current) {
              if (offer.sender.id === clientId.current && publishedFiles.current.has(offer.fileId)) {
                sendSocketMessage(socket.current, { type: 'file-offer', target: event.peer.id, ...offer })
              }
            }
          } else if (event.type === 'peer-left') {
            setPeers((current) => current.filter((peer) => peer.id !== event.peerId))
            connections.current.get(event.peerId)?.close()
            connections.current.delete(event.peerId)
            channels.current.delete(event.peerId)
            setFileOffers((current) => current.map((offer) => offer.sender.id === event.peerId ? { ...offer, available: false } : offer))
          } else if (event.type === 'chat') {
            setMessages((current) => [...current, event])
          } else if (event.type === 'file-offer') {
            setFileOffers((current) => {
              const offer = { ...event, available: true } as FileOffer
              const existing = current.findIndex((item) => item.fileId === event.fileId)
              if (existing < 0) return [...current, offer]
              return current.map((item, index) => index === existing ? { ...offer, state: item.state } : item)
            })
          } else if (event.type === 'file-request') {
            const file = publishedFiles.current.get(event.fileId)
            if (file) await transferFile(file, event.requester, event.fileId)
          } else if (event.type === 'signal') {
            await handleSignal(event)
          }
        } catch (error) {
          console.error('无法处理聊天室事件', error)
        }
      })()
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

  const publishFile = (file: File, preview?: string) => {
    if (file.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE) {
      throw new Error('图片大小不能超过 90 MB')
    }
    const fileId = crypto.randomUUID()
    publishedFiles.current.set(fileId, file)
    sendSocketMessage(socket.current, {
      type: 'file-offer', fileId, name: file.name, size: file.size,
      mimeType: file.type || 'application/octet-stream',
      preview,
    })
  }

  const requestFile = (offer: FileOffer) => {
    if (!offer.available || offer.sender.id === clientId.current) return
    setFileOffers((current) => current.map((item) => item.fileId === offer.fileId ? { ...item, state: 'requesting' } : item))
    sendSocketMessage(socket.current, { type: 'file-request', fileId: offer.fileId, target: offer.sender.id })
  }

  return {
    clientId: clientId.current, messages, peers, files, fileOffers, status,
    sendMessage, publishFile, requestFile, leave: onDisconnected,
  }
}
