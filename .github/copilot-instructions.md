# 项目说明

- [x] 项目需求：临时在线聊天室，同房间号用户实时聊天。
- [x] 技术栈：Vite、React、TypeScript、原生 WebSocket 与 WebRTC。
- [x] 隐私要求：聊天消息只保留在前端 React 内存，不使用 localStorage 或后端存储。
- [x] 文件传输：通过 WebRTC DataChannel P2P 传输；后端仅转发 SDP/ICE 信令。
- [x] 后端位置：`D:\awesomeProject\web-message-backend`，使用 Cloudflare Workers Durable Objects。
- [x] 前端构建：`npm run build`；代码检查：`npm run lint`。
- [x] 本地联调：后端运行 `npm run dev`，前端运行 `npm run dev`。
- [x] 部署配置：通过 `VITE_SIGNAL_URL` 指定 Worker HTTPS 地址。
