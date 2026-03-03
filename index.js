const { nativeImage } = require("electron/common");
const { app, Tray, Menu, BrowserWindow, ipcMain } = require("electron/main");
const os = require("os");
const path = require("path");
const si = require("systeminformation");
const diskTool = require("./src/disk");

// 为 Tray 对象保存一个全局引用以避免被垃圾回收
let tray;

// 16x16 红色圆形 data URL
const icon = nativeImage.createFromPath(path.join(__dirname, "src", "assets", "ic_launcher.png"));

let mainWindow = null;
let isQuitting = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    title: "sn桌面小工具",
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    skipTaskbar: true,
    // webPreferences: { nodeIntegration: true, contextIsolation: false },
    webPreferences: {
      nodeIntegration: false, // ❌ 关闭
      contextIsolation: true, // ✅ 开启
      sandbox: true, // ✅ 启用沙箱
      webSecurity: true, // ✅ 开启 Web 安全
      preload: path.join(__dirname, "./src/preload.js"), // ✅ 指定 preload
    },
  });

  // 窗口关闭事件（点击X时）
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault(); // 阻止默认关闭行为
      mainWindow.hide(); // 隐藏窗口
      return false;
    }
    closeTimeout();
  });

  const isDev = process.env.npm_lifecycle_event === "start";
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile("./dist/index.html");
  }
};

function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow = createWindow();
  }
}

app.whenReady().then(() => {
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示",
      click: () => {
        showMainWindow();
      },
    },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  createWindow();
});

const getSystemInfo = async () => {
  // const t = await getTemperature();

  const res = {
    // CPU
    cpu: {
      model: os.cpus()[0].model,
      cores: os.cpus().length,
      usage: await getCpuUsage(),
      speed: os.cpus()[0].speed,
    },
    // 内存
    memory: {
      total: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 100) / 100 + " GB",
      free: Math.round((os.freemem() / 1024 / 1024 / 1024) * 100) / 100 + " GB",
      usage: Math.round((1 - os.freemem() / os.totalmem()) * 100) + "%",
    },
    // 系统
    system: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: Math.floor(os.uptime() / 3600) + " 小时",
    },
    // 磁盘
    disk: await diskTool.getDiskInfo(),
    // 网络
    network: {
      speed: await getNetworkSpeed(),
    },
    // // 电池
    // battery: await getBatteryInfo(),
    // 进程
    processes: (await si.processes()).list.length,
  };
  return res;
};

// 提供系统信息
ipcMain.handle("get-system-info", getSystemInfo);

async function getCpuUsage() {
  const cLoad = await si.currentLoad();
  return Math.round(cLoad.currentLoad) + "%";
}

async function getNetworkInfo() {
  const net = await si.networkInterfaces();
  return net.map((n) => ({
    iface: n.iface,
    ip4: n.ip4,
    speed: n.speed,
  }));
}

const prevStats = {};
async function getNetworkSpeed() {
  try {
    const currentStats = await si.networkStats();

    if (!currentStats || currentStats.length === 0) {
      return false;
    }

    const result = {
      timestamp: Date.now(),
      interfaces: [],
      total: { rx: 0, tx: 0 },
      activeInterface: null,
    };

    // 计算每个接口的实时速度
    for (let stats of currentStats) {
      const iface = stats.iface;

      if (!prevStats[iface]) {
        prevStats[iface] = {
          rx_bytes: stats.rx_bytes,
          tx_bytes: stats.tx_bytes,
          timestamp: Date.now(),
        };

        result.interfaces.push({
          iface: iface,
          rx_speed: 0,
          tx_speed: 0,
          rx_total: stats.rx_bytes,
          tx_total: stats.tx_bytes,
          operational: stats.operational,
          type: stats.type,
        });
        continue;
      }

      // 计算时间差（秒）
      const timeDiff = (Date.now() - prevStats[iface].timestamp) / 1000;
      if (timeDiff <= 0) timeDiff = 1;

      // 计算速度（字节/秒）
      const rx_speed = (stats.rx_bytes - prevStats[iface].rx_bytes) / timeDiff;
      const tx_speed = (stats.tx_bytes - prevStats[iface].tx_bytes) / timeDiff;

      result.interfaces.push({
        iface: iface,
        rx_speed: rx_speed,
        tx_speed: tx_speed,
        rx_total: stats.rx_bytes,
        tx_total: stats.tx_bytes,
        operational: stats.operational,
        type: stats.type,
        carrier_changes: stats.carrier_changes,
        rx_dropped: stats.rx_dropped,
        tx_dropped: stats.tx_dropped,
      });

      // 累加到总量
      result.total.rx += rx_speed;
      result.total.tx += tx_speed;

      // 更新缓存
      prevStats[iface] = {
        rx_bytes: stats.rx_bytes,
        tx_bytes: stats.tx_bytes,
        timestamp: Date.now(),
      };
    }

    // 找出活动接口（速度最快的）
    result.activeInterface = getActiveInterface(result.interfaces);

    return {
      rx: result.activeInterface.rx_speed,
      tx: result.activeInterface.tx_speed,
    };
  } catch (err) {
    console.error("获取网速失败:", err.message);
  }
}
// 2. 获取活动接口
function getActiveInterface(interfaces) {
  if (!interfaces || interfaces.length === 0) return null;

  // 排除回环接口和未运行的接口
  const active = interfaces.filter(
    (iface) =>
      iface.iface !== "lo" &&
      //  && iface.operational
      (iface.rx_speed > 0 || iface.tx_speed > 0)
  );

  if (active.length === 0) return null;

  // 找出总速度最高的接口
  return active.reduce((max, iface) => {
    const totalSpeed = iface.rx_speed + iface.tx_speed;
    const maxSpeed = max.rx_speed + max.tx_speed;
    return totalSpeed > maxSpeed ? iface : max;
  });
}

async function getBatteryInfo() {
  try {
    const bat = await si.battery();
    return {
      hasBattery: bat.hasBattery,
      percent: bat.percent + "%",
      isCharging: bat.isCharging,
    };
  } catch {
    return { hasBattery: false };
  }
}
async function getTemperature() {
  try {
    const temp = await si.cpuTemperature();
    return {
      main: temp.main,
      cores: temp.cores,
      max: temp.max,
    };
  } catch (err) {
    return {};
  }
}

let timeout = 0;
const interval = 3000;
function closeTimeout() {
  if (timeout) {
    clearInterval(timeout);
    timeout = 0;
  }
}
// 实时更新
ipcMain.handle("start-monitor", async (event) => {
  closeTimeout();

  timeout = setInterval(async () => {
    const info = await getSystemInfo();
    event.sender.send("real-time-update", info);
  }, interval);
});
