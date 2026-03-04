const os = require("os");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

// 获取瞬时 CPU 使用率
function getInstantCPUUsage() {
  const cpus = os.cpus();
  let totalIdle = 0,
    totalTick = 0;

  cpus.forEach((cpu) => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  return {
    idle: totalIdle / cpus.length,
    total: totalTick / cpus.length,
  };
}

let cacheMeasure = null;
let currentMeasure = null;
exports.getCpuUsage = async function () {
  if (os.platform === "win32") {
  }
  return cpuUsageFuncs[os.platform() === "win32" ? "windows" : "normal"]();
};

const cpuUsageFuncs = {
  normal: function () {
    cacheMeasure = currentMeasure;
    currentMeasure = getInstantCPUUsage();

    if (!cacheMeasure) {
      return 0;
    }

    const idleDiff = currentMeasure.idle - cacheMeasure.idle;
    const totalDiff = currentMeasure.total - cacheMeasure.total;
    const usage = 100 - (100 * idleDiff) / totalDiff;
    return usage;
  },
  windows: async function () {
    try {
      const { stdout } = await execAsync('powershell "(Get-CimInstance Win32_Processor).LoadPercentage"');
      const res = parseFloat(stdout.trim()) || 0;
      return res;
    } catch {
      return 0;
    }
  },
};
function normalSysCpuUsage() {}
