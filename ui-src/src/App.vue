<script setup lang="ts">
import { onMounted, ref } from "vue";

const electronAPI = (window as any).electronAPI;

const time = ref("");
const cpu = ref("");
const mem = ref("");
const disk = ref("");
const netSpeeds = ref<string[]>([]);

onMounted(() => {
  refresh(); // 初始加载
  setTimeout(startRealtime, 2000);
});

const refresh = async function (info?: any) {
  if (!info) {
    info = await electronAPI.getSystemInfo();
  }

  cpu.value = `${info.cpu.usage} (${info.cpu.cores}核)`;

  mem.value = `${info.memory.usage} | 总:${info.memory.total}`;

  // disk.value = info.disk[0]?.use || "N/A";
  disk.value = "N/A";

  // document.getElementById('sys').innerHTML =
  //   `${info.system.platform} ${info.system.release}`

  if (info.network?.speed) {
    const rx = (info.network.speed.rx / 1000)?.toFixed(2);
    const tx = (info.network.speed.tx / 1000)?.toFixed(2);
    netSpeeds.value = [`rx-${rx}KBs`, `tx-${tx}KBs`];
  }
};

const startRealtime = function () {
  electronAPI.startMonitor();
  electronAPI.watchSysInfo((data: any) => {
    refresh(data);
  });
  setInterval(() => {
    time.value = new Date().toLocaleString()?.replace(/\//g, "-");
  }, 500);
};
</script>

<template>
  <div class="box">
    <div class="title">💻 {{ time }}</div>

    <div class="status">
      <p class="row">
        <span class="label">CPU: </span>
        <span class="value">{{ cpu || "加载中..." }}</span>
      </p>
      <p class="row">
        <span class="label">内存: </span>
        <span class="value">{{ mem || "加载中..." }}</span>
      </p>
      <p class="row">
        <span class="label">磁盘: </span>
        <span class="value">{{ disk || "加载中..." }}</span>
      </p>
      <!-- <p>系统: <span id="sys">加载中...</span></p> -->
      <p class="row">
        <span class="label">网络: </span>
        <span class="value">
          <template v-if="netSpeeds.length <= 0">加载中...</template>
          <template v-else>
            <div class="sm">{{ netSpeeds[0] }}</div>
            <div class="sm">{{ netSpeeds[1] }}</div>
          </template>
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.box {
  color: var(--txt-color);
  border: 2px solid var(--txt-color);
  border-radius: 0.5em;
  padding: 2em;
  box-sizing: border-box;
  .title {
    font-size: 1.5em;
    font-weight: 400;
  }

  .status {
    text-align: left;
    font-size: 1em;
    p {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.1em;
      padding: 0.2em;
      height: 1em;
      margin: 1em 0 0;
    }
    .label {
      display: inline-block;
      font-weight: bold;
      font-size: 1.1em;
      min-width: 3em;
    }
    .value {
      display: inline-block;
      width: 11em;
      .sm {
        font-size: 0.8em;
      }
    }
  }
}
</style>
