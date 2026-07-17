# 瞬语聊天室

React + TypeScript + Vite 实现的临时在线聊天室。

- 相同房间号的用户进入同一聊天室。
- 聊天记录只存在当前页面内存，刷新即清空。
- 文件通过 WebRTC DataChannel 点对点传输，服务端仅转发协商信令。
- 文件先发布为房间公告，成员点击下载后才开始 P2P 传输。
- 图片支持压缩缩略图预览，原图最大 90 MiB，且只在用户点击后传输。
- 后端位于 `D:\awesomeProject\web-message-backend`。

## 本地运行

先在后端目录执行 `npm install` 和 `npm run dev`，再在本目录执行：

```text
npm install
npm run dev
```

开发环境默认连接 `http://localhost:8787`，生产构建默认连接 `https://api.msg.rem.asia`。

也可以在 Cloudflare 构建变量中通过 `VITE_SIGNAL_URL` 覆盖后端地址。该变量应填写 HTTPS 地址，前端会自动转换为 `wss://` WebSocket 地址。
