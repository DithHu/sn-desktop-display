// preload.js - 预加载脚本
const { contextBridge, ipcRenderer } = require("electron");

// 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  // 暴露需要的方法
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  startMonitor: () => ipcRenderer.invoke("start-monitor"),
  watchSysInfo: (func) => ipcRenderer.on("real-time-update", (event, data) => func(data)),
  // 暴露特定模块
  platform: process.platform,
  versions: process.versions,
});
