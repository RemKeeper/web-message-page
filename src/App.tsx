import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, Check, Copy, Download, FileUp,
  Hash, LogOut, MessageCircle, Paperclip, Send, ShieldCheck, Users, X,
} from 'lucide-react'
import { useRoom } from './useRoom'
import './App.css'

interface Session { roomId: string; name: string }

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
  const { clientId, messages, peers, files, status, sendMessage, sendFile } = useRoom(session.roomId, session.name, onLeave)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [fileModal, setFileModal] = useState<File | null>(null)
  const [targetPeer, setTargetPeer] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  useEffect(() => { if (!targetPeer && peers[0]) setTargetPeer(peers[0].id) }, [peers, targetPeer])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (draft.trim()) { sendMessage(draft.trim()); setDraft('') }
  }
  const copyRoom = async () => {
    await navigator.clipboard.writeText(session.roomId)
    setCopied(true); window.setTimeout(() => setCopied(false), 1600)
  }
  const startTransfer = async () => {
    if (!fileModal || !targetPeer) return
    try { await sendFile(fileModal, targetPeer); setFileModal(null) }
    catch (error) { window.alert(error instanceof Error ? error.message : '文件发送失败') }
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
        <div className="conversation-top"><div><h2>房间对话</h2><p><span className={`status-dot ${status}`} />{status === 'online' ? '实时连接已建立' : status === 'connecting' ? '正在连接…' : '连接已断开'}</p></div></div>
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
          {files.map((file) => <article className="transfer" key={file.id}><span className="file-icon">{file.direction === 'sending' ? <FileUp /> : <ArrowDownToLine />}</span><div><strong>{file.name}</strong><small>{file.direction === 'sending' ? `发送给 ${file.peerName}` : `来自 ${file.peerName}`} · {(file.size / 1024 / 1024).toFixed(2)} MB</small><div className="progress"><i style={{ width: `${file.progress}%` }} /></div></div><b>{file.progress}%</b>{file.url && <a href={file.url} download={file.name} title="下载文件"><Download size={18} /></a>}</article>)}
          <div ref={bottomRef} />
        </div>
        <form className="composer" onSubmit={submit}>
          <input ref={fileInput} type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) setFileModal(file); e.target.value = '' }} />
          <button type="button" className="attach-button" onClick={() => fileInput.current?.click()} disabled={!peers.length} title={peers.length ? '发送文件' : '等待其他成员加入'}><Paperclip size={20} /></button>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} placeholder="输入消息…" rows={1} maxLength={4000} />
          <button className="send-button" disabled={!draft.trim() || status !== 'online'}><Send size={19} /></button>
        </form>
      </section>
    </div>
    {fileModal && <div className="modal-backdrop"><section className="file-modal"><button className="modal-close" onClick={() => setFileModal(null)}><X /></button><span className="file-modal-icon"><FileUp /></span><p className="eyebrow">PEER-TO-PEER TRANSFER</p><h3>发送文件</h3><div className="selected-file"><strong>{fileModal.name}</strong><small>{(fileModal.size / 1024 / 1024).toFixed(2)} MB · 文件不经过服务器</small></div><label>选择接收人<select value={targetPeer} onChange={(e) => setTargetPeer(e.target.value)}>{peers.map((peer) => <option value={peer.id} key={peer.id}>{peer.name}</option>)}</select></label><button className="primary-button" onClick={startTransfer} disabled={!targetPeer}>开始点对点传输 <ArrowRight size={18} /></button><p className="modal-hint"><ShieldCheck size={15} />传输仅在双方浏览器之间进行</p></section></div>}
  </main>
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  return session ? <ChatRoom session={session} onLeave={() => setSession(null)} /> : <JoinScreen onJoin={setSession} />
}

export default App
