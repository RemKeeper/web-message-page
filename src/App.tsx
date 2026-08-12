import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, Check, Copy, Download, FileUp,
  Hash, Image as ImageIcon, LogOut, MessageCircle, Paperclip, RefreshCw, Send, Share2, ShieldCheck, Users, X,
} from 'lucide-react'
import { MAX_IMAGE_SIZE, useRoom } from './useRoom'
import './App.css'

interface Session { roomId: string; name: string }

async function createImagePreview(file: File) {
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    let maxEdge = 640
    let preview = ''
    do {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      preview = canvas.toDataURL('image/jpeg', 0.6)
      maxEdge = Math.round(maxEdge * 0.75)
    } while (preview.length > 150_000 && maxEdge >= 180)
    return preview.length <= 150_000 ? preview : undefined
  } finally {
    URL.revokeObjectURL(source)
  }
}

function JoinScreen({ onJoin }: { onJoin: (session: Session) => void }) {
  const [roomId, setRoomId] = useState('')
  const [name, setName] = useState('')
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const safeRoom = roomId.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
    const safeName = name.trim().slice(0, 24)
    if (safeRoom && safeName) onJoin({ roomId: safeRoom, name: safeName })
  }

  return <main className="join-page">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <section className="join-card">
      <div className="brand-mark"><MessageCircle size={25} strokeWidth={2.4} /></div>
      <p className="eyebrow">PRIVATE · EPHEMERAL · DIRECT</p>
      <h1>此刻，尽情聊。</h1>
      <p className="join-lead">输入同一个房间号即可相遇。消息不落盘，文件点对点传输，离开便不留痕迹。</p>
      <form onSubmit={submit}>
        <label>你的昵称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="怎么称呼你？" autoFocus /></label>
        <label>房间号<div className="input-with-icon"><Hash size={18} /><input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="例如：sunset-2026" /></div></label>
        <button className="primary-button" disabled={!name.trim() || !roomId.trim()}>进入房间 <ArrowRight size={18} /></button>
      </form>
      <div className="privacy-note"><ShieldCheck size={18} /><span><strong>不保存聊天记录</strong><small>刷新或关闭页面后，本地消息立即清空</small></span></div>
    </section>
    <footer>无需注册 · 无需安装 · 浏览器端加密连接</footer>
  </main>
}

function ChatRoom({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const {
    clientId, messages, peers, files, fileOffers, status,
    sendMessage, publishFile, requestFile, reconnect,
  } = useRoom(session.roomId, session.name, onLeave)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [fileModal, setFileModal] = useState<File | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, fileOffers, files])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (draft.trim()) { sendMessage(draft.trim()); setDraft('') }
  }
  const copyRoom = async () => {
    await navigator.clipboard.writeText(session.roomId)
    setCopied(true); window.setTimeout(() => setCopied(false), 1600)
  }
  const publishSelectedFile = async () => {
    if (!fileModal) return
    try {
      const preview = fileModal.type.startsWith('image/') ? await createImagePreview(fileModal) : undefined
      publishFile(fileModal, preview)
      setFileModal(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '文件发布失败')
    }
  }

  return <main className="chat-shell">
    <header className="chat-header">
      <div className="brand"><span className="brand-mark small"><MessageCircle size={20} /></span><span>瞬语<small>EPHEMERAL CHAT</small></span></div>
      <button className="room-chip" onClick={copyRoom}><Hash size={15} /><span>{session.roomId}</span>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
      <button className="icon-button leave" onClick={onLeave} title="离开房间"><LogOut size={19} /></button>
    </header>
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-heading"><span><Users size={17} />在线成员</span><b>{peers.length + 1}</b></div>
        <div className="members">
          <div className="member"><span className="avatar mine">{session.name[0]?.toUpperCase()}</span><span>{session.name}<small>你</small></span><i /></div>
          {peers.map((peer, index) => <div className="member" key={peer.id}><span className={`avatar tone-${index % 4}`}>{peer.name[0]?.toUpperCase()}</span><span>{peer.name}<small>P2P {status === 'online' ? '可连接' : '连接中'}</small></span><i /></div>)}
        </div>
        <div className="sidebar-info"><ShieldCheck size={18} /><p><strong>阅后即焚式会话</strong><span>服务器不存储任何聊天内容</span></p></div>
      </aside>
      <section className="conversation">
        <div className="conversation-top">
          <div><h2>房间对话</h2><p><span className={`status-dot ${status}`} />{status === 'online' ? '实时连接已建立' : status === 'connecting' ? '正在连接…' : '连接已断开'}</p></div>
          {status === 'offline' && <button className="reconnect-button" onClick={reconnect}><RefreshCw size={14} />重新连接</button>}
        </div>
        <div className="message-list">
          <div className="system-message"><ShieldCheck size={15} />你已进入房间。这里的消息仅保存在当前页面。</div>
          {messages.length === 0 && <div className="empty-state"><MessageCircle size={34} /><strong>安静得刚刚好</strong><span>发一条消息，开启此刻的对话</span></div>}
          {messages.map((message) => {
            const mine = message.sender.id === clientId
            return <article className={`message ${mine ? 'message-mine' : ''}`} key={message.id}>
              {!mine && <span className="message-avatar">{message.sender.name[0]?.toUpperCase()}</span>}
              <div><div className="message-meta"><strong>{mine ? '你' : message.sender.name}</strong><time>{new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></div>
            </article>
          })}
          {fileOffers.map((offer) => {
            const mine = offer.sender.id === clientId
            return <article className="file-offer" key={offer.fileId}>
              {offer.preview
                ? <img className="offer-preview" src={offer.preview} alt={offer.name} />
                : <span className="file-icon">{offer.mimeType.startsWith('image/') ? <ImageIcon /> : <Share2 />}</span>}
              <div>
                <strong>{offer.name}</strong>
                <small>{mine ? '你发布的文件' : `${offer.sender.name} 发布`} · {(offer.size / 1024 / 1024).toFixed(2)} MB</small>
                <em>文件保留在发布者浏览器中，点击后建立 P2P 传输</em>
              </div>
              {mine
                ? <span className="offer-status">等待下载</span>
                : <button
                    className="download-request"
                    disabled={!offer.available || Boolean(offer.state)}
                    onClick={() => requestFile(offer)}
                  >
                    <Download size={16} />
                    {!offer.available ? '发布者已离线' : offer.state === 'requesting' ? '正在请求' : offer.state === 'receiving' ? '接收中' : '下载'}
                  </button>}
            </article>
          })}
          {files.map((file) => <article className="transfer" key={file.id}>{file.url && file.mimeType.startsWith('image/') ? <img className="received-preview" src={file.url} alt={file.name} /> : <span className="file-icon">{file.direction === 'sending' ? <FileUp /> : <ArrowDownToLine />}</span>}<div><strong>{file.name}</strong><small>{file.direction === 'sending' ? `发送给 ${file.peerName}` : `来自 ${file.peerName}`} · {(file.size / 1024 / 1024).toFixed(2)} MB</small><div className="progress"><i style={{ width: `${file.progress}%` }} /></div></div><b>{file.progress}%</b>{file.url && <a href={file.url} download={file.name} title="下载文件"><Download size={18} /></a>}</article>)}
          <div ref={bottomRef} />
        </div>
        <form className="composer" onSubmit={submit}>
          <input ref={fileInput} type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file?.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE) window.alert('图片大小不能超过 90 MB'); else if (file) setFileModal(file); e.target.value = '' }} />
          <button type="button" className="attach-button" onClick={() => fileInput.current?.click()} disabled={status !== 'online'} title="发布文件到房间"><Paperclip size={20} /></button>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} placeholder="输入消息…" rows={1} maxLength={4000} />
          <button className="send-button" disabled={!draft.trim() || status !== 'online'}><Send size={19} /></button>
        </form>
      </section>
    </div>
    {fileModal && <div className="modal-backdrop"><section className="file-modal"><button className="modal-close" onClick={() => setFileModal(null)}><X /></button><span className="file-modal-icon">{fileModal.type.startsWith('image/') ? <ImageIcon /> : <Share2 />}</span><p className="eyebrow">ON-DEMAND P2P TRANSFER</p><h3>{fileModal.type.startsWith('image/') ? '发布图片' : '发布文件'}</h3><div className="selected-file"><strong>{fileModal.name}</strong><small>{(fileModal.size / 1024 / 1024).toFixed(2)} MB · 文件不上传服务器</small></div>{fileModal.type.startsWith('image/') && <p className="image-limit"><ImageIcon size={15} />图片最大支持 90 MB，将生成压缩预览供房间展示</p>}<p className="publish-description">房间成员将看到文件公告。只有成员点击下载时，浏览器才会通过 WebRTC 点对点发送原文件。</p><button className="primary-button" onClick={() => void publishSelectedFile()}>发布到房间 <ArrowRight size={18} /></button><p className="modal-hint"><ShieldCheck size={15} />请保持此页面在线，否则其他成员无法下载</p></section></div>}
  </main>
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  return session ? <ChatRoom session={session} onLeave={() => setSession(null)} /> : <JoinScreen onJoin={setSession} />
}

export default App
