(() => {
  const IS_INDEX2_MODE = /index2\.html$/i.test(window.location.pathname);
  const STORAGE_KEY = "abyss-pomodoro-state";
  const CIRCLE_RADIUS = 130;
  const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS;
  const FOCUS_REWARD_TOKEN = 2;
  const BOARD_SIZE = 25;
  const GRID_SIDE = 5;
  const HOUSE_EDGE = 0.99;
  const BET_COST_TOKEN = 1;
  const NEW_USER_COINS = 100;
  const MIN_BET = 1;
  const BREAK_SECONDS = 5 * 60;

  const modeLabel = document.getElementById("modeLabel");
  const timeText = document.getElementById("timeText");
  const walletBalance = document.getElementById("walletBalance");
  const shopWalletBalance = document.getElementById("shopWalletBalance");
  const winRateText = document.getElementById("winRateText");
  const focusCountStat = document.getElementById("focusCountStat");
  const coinStat = document.getElementById("coinStat");
  const statsHistoryBody = document.getElementById("statsHistoryBody");
  const resetStatsBtn = document.getElementById("resetStatsBtn");
  const openStatsBtn = document.getElementById("openStatsBtn");
  const openShopBtn = document.getElementById("openShopBtn");
  const backFromStatsBtn = document.getElementById("backFromStatsBtn");
  const backFromShopBtn = document.getElementById("backFromShopBtn");
  const debugGameBtn = document.getElementById("debugGameBtn");
  const statsPage = document.getElementById("statsPage");
  const shopPage = document.getElementById("shopPage");
  const shopItems = document.getElementById("shopItems");
  const shopWarning = document.getElementById("shopWarning");
  const welcomeSplash = document.getElementById("welcomeSplash");
  const appShell = document.querySelector(".app-shell");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resetBtn = document.getElementById("resetBtn");
  const minuteRange = document.getElementById("minuteRange");
  const selectedMinutes = document.getElementById("selectedMinutes");
  const ringProgress = document.querySelector(".ring-progress");
  const timerPanel = document.querySelector(".timer-panel");
  const gambleMount = document.getElementById("gambleMount");

  ringProgress.style.strokeDasharray = String(CIRCLE_LENGTH);
  ringProgress.style.strokeDashoffset = "0";

  const state = {
    mode: "focus",
    selectedMinutes: 25,
    totalSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    timerId: null,
    running: false,
    paused: false,
    tokens: 0,
    virtualCoins: NEW_USER_COINS,
    justFinishedFocus: false,
    focusCompletedCount: 0,
    netVirtualCoins: 0,
    lastPredictedWinRate: null,
    gameHistory: []
  };

  // Mines 遊戲的核心資料存於 IIFE 內，Console 無法直接讀到答案陣列。
  let audioCtx = null;
  let mines = [];
  let revealed = new Set();
  let activeRound = false;
  let mineCount = 3;
  let currentMultiplier = 1;
  let currentStake = MIN_BET;
  let lastStatus = "請先投注開始本局。";
  let showingStatsPage = false;
  let roundSource = "專注獎勵";
  let resultScreen = null;
  let lockBackTimeoutId = null;
  let currentView = "focus";
  let selectedGame = "mines";
  let resultOverlayNode = null;
  let simulationOverlayNode = null;
  let plinkoRafId = null;
  let plinkoBurstSettleTimerId = null;
  const plinko = {
    rows: 10,
    risk: "medium",
    path: [],
    active: false,
    animating: false,
    ballX: 0,
    ballY: 0,
    targetIndex: 0,
    activePegRow: -1,
    pegFlashUntil: 0,
    stakeAtRound: MIN_BET,
    activePegCol: -1,
    laneFlashUntil: 0,
    phase: "idle",
    dropStartMs: 0,
    settled: false,
    roundDeducted: false,
    visualBallCount: 6,
    burstRounds: [],
    burstSettledCount: 0,
    burstTotalStake: 0,
    burstProfitAccum: 0
  };
  const plinkoUi = {
    canvas: null,
    ctx: null,
    previewLine: null,
    warnLine: null,
    betBtn: null,
    binsNode: null,
    activeCanvas: null
  };
  const shopCatalog = [
    { id: "gift-1", name: "星塵寶箱", price: 25, desc: "開出閃光視覺特效（示意）。" },
    { id: "gift-2", name: "霓虹外框", price: 40, desc: "盤面外框霓虹色調（示意）。" },
    { id: "gift-3", name: "勝利煙火", price: 60, desc: "勝利時額外煙火動畫（示意）。" }
  ];

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        selectedMinutes: state.selectedMinutes,
        totalSeconds: state.totalSeconds,
        remainingSeconds: state.remainingSeconds,
        tokens: state.tokens,
        virtualCoins: state.virtualCoins,
        justFinishedFocus: state.justFinishedFocus,
        focusCompletedCount: state.focusCompletedCount,
        netVirtualCoins: state.netVirtualCoins,
        lastPredictedWinRate: state.lastPredictedWinRate,
        mineCount,
        plinkoRows: plinko.rows,
        plinkoRisk: plinko.risk,
        gameHistory: state.gameHistory
      })
    ); // 使用 localStorage 保存番茄鐘與統計資料，重整後仍可延續紀錄。
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY); // 從 localStorage 載入資料，恢復先前 UI/數據。
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.selectedMinutes === "number") state.selectedMinutes = Math.max(1, Math.min(60, parsed.selectedMinutes));
      if (typeof parsed.totalSeconds === "number") state.totalSeconds = parsed.totalSeconds;
      if (typeof parsed.remainingSeconds === "number") state.remainingSeconds = parsed.remainingSeconds;
      if (typeof parsed.tokens === "number") state.tokens = Math.max(0, parsed.tokens);
      if (typeof parsed.virtualCoins === "number") {
        state.virtualCoins = Math.max(0, Number(parsed.virtualCoins.toFixed(2)));
      } else {
        state.virtualCoins = Math.max(0, Number((NEW_USER_COINS + state.netVirtualCoins).toFixed(2)));
      }
      if (typeof parsed.mode === "string") state.mode = parsed.mode;
      state.justFinishedFocus = Boolean(parsed.justFinishedFocus);
      if (typeof parsed.focusCompletedCount === "number") state.focusCompletedCount = Math.max(0, parsed.focusCompletedCount);
      if (typeof parsed.netVirtualCoins === "number") state.netVirtualCoins = Number(parsed.netVirtualCoins.toFixed(2));
      if (typeof parsed.lastPredictedWinRate === "number") {
        state.lastPredictedWinRate = Math.max(1, Math.min(99, Math.trunc(parsed.lastPredictedWinRate)));
      }
      if (typeof parsed.mineCount === "number") mineCount = Math.max(1, Math.min(24, Math.trunc(parsed.mineCount)));
      if (typeof parsed.plinkoRows === "number") plinko.rows = Math.max(8, Math.min(16, Math.trunc(parsed.plinkoRows)));
      if (typeof parsed.plinkoRisk === "string") {
        if (["low", "medium", "high"].includes(parsed.plinkoRisk)) plinko.risk = parsed.plinkoRisk;
      }
      if (Array.isArray(parsed.gameHistory)) state.gameHistory = parsed.gameHistory.slice(0, 40);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new window.AudioContext(); // 建立 AudioContext 以 Web Audio 合成提示聲音。
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume(); // 使用者互動後恢復音訊，符合瀏覽器自動播放政策。
    }
  }

  function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function notifyTimeUp(message) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification("FocusBet 計時完成", { body: message });
    }
  }

  function playBell() {
    ensureAudio();
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    gain.connect(audioCtx.destination);
    [880, 1174].forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + index * 0.12);
      osc.connect(gain);
      osc.start(now + index * 0.12);
      osc.stop(now + 0.48 + index * 0.12);
    });
  }

  function playWinSfx() {
    ensureAudio();
    const now = audioCtx.currentTime;
    [660, 880, 1320].forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.15, now + idx * 0.06 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.36);
    });
  }

  function playLoseSfx() {
    ensureAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.56);
  }

  function showWelcomeSplash() {
    setTimeout(() => {
      welcomeSplash.classList.add("show");
    }, 60);
    setTimeout(() => {
      welcomeSplash.classList.add("title-in");
    }, 520);
    setTimeout(() => {
      welcomeSplash.classList.add("fade-out");
      setTimeout(() => {
        appShell.classList.remove("hidden-lock");
        welcomeSplash.classList.add("hidden-lock");
      }, 1000);
    }, 4000);
  }

  function toClock(total) {
    const min = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const sec = Math.floor(total % 60)
      .toString()
      .padStart(2, "0");
    return `${min}:${sec}`;
  }

  function applyTheme() {
    document.body.classList.remove("theme-focus", "theme-break", "theme-gamble");
    if (state.mode === "focus") document.body.classList.add("theme-focus");
    if (state.mode === "break") document.body.classList.add("theme-break");
    if (state.mode === "gamble") document.body.classList.add("theme-gamble");
  }

  function updateRing() {
    const progress = 1 - state.remainingSeconds / Math.max(1, state.totalSeconds);
    const offset = CIRCLE_LENGTH * (1 - progress);
    ringProgress.style.strokeDashoffset = String(offset); // 以 SVG stroke-dashoffset 控制圓環進度，秒數越少偏移越大。
  }

  function buildPredictedWinRate() {
    const focusFactor = state.selectedMinutes / 60;
    const experienceFactor = Math.min(0.2, state.focusCompletedCount * 0.01);
    const raw = 0.42 + focusFactor * 0.26 + experienceFactor;
    return Math.max(35, Math.min(83, Math.round(raw * 100)));
  }

  function updateLabels() {
    modeLabel.textContent = state.mode === "focus" ? "專注模式" : state.mode === "break" ? "休息模式" : "賭博模式";
    timeText.textContent = toClock(state.remainingSeconds);
    selectedMinutes.textContent = String(state.selectedMinutes);
    walletBalance.textContent = state.virtualCoins.toFixed(2);
    shopWalletBalance.textContent = state.virtualCoins.toFixed(2);
    winRateText.textContent = state.lastPredictedWinRate === null ? "--%" : `${state.lastPredictedWinRate}%`;
    focusCountStat.textContent = String(state.focusCompletedCount);
    coinStat.textContent = String(state.netVirtualCoins.toFixed(2));
    startBtn.textContent = state.running ? "進行中..." : state.mode === "break" ? "開始休息" : "開始專注";
    startBtn.disabled = state.running || state.mode === "gamble";
    pauseBtn.textContent = state.paused ? "繼續" : "暫停";
    pauseBtn.disabled = state.mode === "gamble" || (!state.running && !state.paused);
  }

  function applyLayout() {
    if (currentView !== "game" || selectedGame !== "plinko") {
      if (plinkoRafId) {
        cancelAnimationFrame(plinkoRafId);
        plinkoRafId = null;
      }
    }
    appShell.classList.remove("layout-focus", "layout-game");
    if (currentView === "focus") {
      appShell.classList.add("layout-focus");
      timerPanel.classList.remove("hidden-lock");
      if (!showingStatsPage) gambleMount.classList.add("hidden-lock");
      return;
    }
    appShell.classList.add("layout-game");
    timerPanel.classList.add("hidden-lock");
    if (!showingStatsPage) gambleMount.classList.remove("hidden-lock");
  }

  function renderStatsTable() {
    statsHistoryBody.innerHTML = "";
    if (state.gameHistory.length === 0) {
      statsHistoryBody.innerHTML = '<tr><td colspan="6">尚無遊戲紀錄</td></tr>';
      return;
    }
    state.gameHistory
      .slice()
      .reverse()
      .forEach((entry) => {
        const tr = document.createElement("tr");
        const delta = Number(entry.coinDelta);
        const deltaClass = delta < 0 ? "coin-negative" : "coin-value";
        tr.innerHTML = `
          <td>${entry.gameName}</td>
          <td>${entry.source}</td>
          <td>${entry.result}</td>
          <td><span class="${deltaClass}">${delta.toFixed(2)}</span></td>
          <td>${Number(entry.multiplier).toFixed(4)}x</td>
          <td>${Number(entry.winRate).toFixed(2)}%</td>
        `;
        statsHistoryBody.appendChild(tr);
      });
  }

  function toggleStatsPage(showStats) {
    showingStatsPage = showStats;
    if (showStats) {
      statsPage.classList.remove("hidden-lock");
      shopPage.classList.add("hidden-lock");
      timerPanel.classList.add("hidden-lock");
      gambleMount.classList.add("hidden-lock");
    } else {
      statsPage.classList.add("hidden-lock");
      applyLayout();
    }
    renderStatsTable();
  }

  function renderShop() {
    shopItems.innerHTML = "";
    shopCatalog.forEach((item) => {
      const card = document.createElement("div");
      card.className = "shop-item";
      card.innerHTML = `
        <h3>${item.name}</h3>
        <p>${item.desc}</p>
        <p>售價：${item.price} 虛擬幣</p>
        <button class="ghost-btn" data-buy="${item.id}">購買</button>
      `;
      shopItems.appendChild(card);
    });
    shopItems.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-buy");
        const item = shopCatalog.find((x) => x.id === id);
        if (!item) return;
        if (state.virtualCoins < item.price) {
          shopWarning.classList.remove("hidden-lock");
          return;
        }
        shopWarning.classList.add("hidden-lock");
        state.virtualCoins = Number((state.virtualCoins - item.price).toFixed(2));
        state.netVirtualCoins = Number((state.netVirtualCoins - item.price).toFixed(2));
        saveState();
        updateLabels();
      });
    });
  }

  function toggleShopPage(showShop) {
    if (showShop) {
      showingStatsPage = true;
      statsPage.classList.add("hidden-lock");
      shopPage.classList.remove("hidden-lock");
      timerPanel.classList.add("hidden-lock");
      gambleMount.classList.add("hidden-lock");
      renderShop();
      return;
    }
    showingStatsPage = false;
    shopPage.classList.add("hidden-lock");
    shopWarning.classList.add("hidden-lock");
    applyLayout();
  }

  function secureShuffle(list) {
    const cloned = [...list];
    for (let i = cloned.length - 1; i > 0; i -= 1) {
      const randomBuffer = new Uint32Array(1);
      crypto.getRandomValues(randomBuffer); // 使用 crypto.getRandomValues 取安全亂數，避免 Math.random 可預測問題。
      const j = randomBuffer[0] % (i + 1);
      [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }
    return cloned;
  }

  function combination(total, choose) {
    // 這行先處理不合法組合，避免後續除法與迴圈出現錯誤。
    if (choose < 0 || choose > total) return 0;
    // 這行把 C(n, k) 轉成 C(n, min(k, n-k))，可縮短運算長度並降低數值膨脹。
    const k = Math.min(choose, total - choose);
    // 這行初始化分子累乘值，後面會一項項乘上去形成組合分子。
    let numerator = 1;
    // 這行初始化分母累乘值，後面會一項項乘上去形成組合分母。
    let denominator = 1;
    // 這行用迴圈展開組合公式，逐步累乘 (n-k+i)/i。
    for (let i = 1; i <= k; i += 1) {
      // 這行把分子乘上對應項，等價於組合公式中的連乘分子。
      numerator *= total - k + i;
      // 這行把分母乘上 i，等價於組合公式中的 k!。
      denominator *= i;
    }
    // 這行回傳分子除分母，得到 C(total, choose) 組合數結果。
    return numerator / denominator;
  }

  function calculateMultiplier(minesCount, revealedSafeCount) {
    // 這行計算 C(25, n)，代表在 25 格放 n 顆雷的總可能配置數。
    const allLayouts = combination(BOARD_SIZE, minesCount);
    // 這行計算 C(25-k, n)，代表在已開 k 顆安全格後，剩下仍可放雷的配置數。
    const survivedLayouts = combination(BOARD_SIZE - revealedSafeCount, minesCount);
    // 這行把題目要求公式中的分子與分母做比值，得到理論倍數成長因子。
    const rawMultiplier = HOUSE_EDGE * (allLayouts / survivedLayouts);
    // 這行把倍數四捨五入到小數第 4 位，讓 UI 看起來穩定且可讀。
    return Number(rawMultiplier.toFixed(4));
  }

  function expectedPayout(multiplier) {
    return Number((currentStake * multiplier).toFixed(2));
  }

  function currentRoundWinRate() {
    const totalSafe = BOARD_SIZE - mineCount;
    if (revealed.size === 0) return (totalSafe / BOARD_SIZE) * 100;
    const nextSafeProb = (totalSafe - revealed.size) / (BOARD_SIZE - revealed.size);
    return Math.max(0, nextSafeProb * 100);
  }

  function secureRandom01() {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 4294967296;
  }

  function runMonteCarloReport(rounds = 10000) {
    const rows = [];
    for (let minesCount = 1; minesCount <= 24; minesCount += 1) {
      let wins = 0;
      let totalReturn = 0;
      const safeProb = (BOARD_SIZE - minesCount) / BOARD_SIZE;
      const multiplier = calculateMultiplier(minesCount, 1);
      for (let i = 0; i < rounds; i += 1) {
        const survived = secureRandom01() < safeProb;
        if (survived) {
          wins += 1;
          totalReturn += multiplier;
        }
      }
      const avgReturn = totalReturn / rounds;
      rows.push({
        mines: minesCount,
        wins,
        winRate: (wins / rounds) * 100,
        multiplier,
        avgReturn: avgReturn * 100,
        avgProfit: (avgReturn - 1) * 100
      });
    }
    return rows;
  }

  function showSimulationOverlay() {
    hideSimulationOverlay();
    const report = runMonteCarloReport(10000);
    const rowsHtml = report
      .map(
        (r) => `
          <tr>
            <td>${r.mines}</td>
            <td>${r.winRate.toFixed(2)}%</td>
            <td>${r.multiplier.toFixed(4)}x</td>
            <td>${r.wins}/10000</td>
            <td>${r.avgReturn.toFixed(2)}%</td>
            <td class="${r.avgProfit < 0 ? "coin-negative" : "coin-value"}">${r.avgProfit.toFixed(2)}%</td>
          </tr>
        `
      )
      .join("");
    const overlay = document.createElement("section");
    overlay.className = "result-global-overlay win";
    overlay.innerHTML = `
      <div class="sim-result">
        <h3>10,000 局模擬報告（每局翻 1 顆就兌現）</h3>
        <p>下表包含 1~24 顆地雷的模擬結果。</p>
        <table>
          <thead>
            <tr>
              <th>地雷數</th>
              <th>命中率</th>
              <th>單顆倍率</th>
              <th>命中局數</th>
              <th>平均回收率</th>
              <th>平均淨利率</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="stats-actions" style="margin-top:10px;">
          <button id="closeSimBtn" class="cta-btn">關閉</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    simulationOverlayNode = overlay;
    overlay.querySelector("#closeSimBtn")?.addEventListener("click", hideSimulationOverlay);
  }

  function getPlinkoRequiredCoins(stake, ballCount) {
    return IS_INDEX2_MODE
      ? Number((stake * Math.max(1, Math.min(12, Math.floor(ballCount)))).toFixed(2))
      : stake;
  }

  function getPlinkoBetButtonText(stake, ballCount) {
    if (!IS_INDEX2_MODE) return `投注（${stake.toFixed(2)} 幣）`;
    const count = Math.max(1, Math.min(12, Math.floor(ballCount)));
    const total = getPlinkoRequiredCoins(stake, count);
    return `投注（${count} 顆，共 ${total.toFixed(2)} 幣）`;
  }

  function runPlinkoMonteCarloReport(rounds = 10000, ballsPerBurst = 1) {
    const bins = plinko.rows + 1;
    const hitCounts = Array.from({ length: bins }, () => 0);
    const multipliers = buildPlinkoMultipliers(plinko.rows, plinko.risk);
    let totalReturn = 0;
    let burstTotalReturn = 0;
    let burstWinCount = 0;
    const burstReturns = [];
    for (let i = 0; i < rounds; i += 1) {
      let oneBurstReturn = 0;
      for (let b = 0; b < ballsPerBurst; b += 1) {
        const path = generatePlinkoPath(plinko.rows);
        const rights = path.reduce((sum, step) => sum + step, 0);
        hitCounts[rights] += 1;
        totalReturn += multipliers[rights];
        oneBurstReturn += multipliers[rights];
      }
      burstReturns.push(oneBurstReturn);
      burstTotalReturn += oneBurstReturn;
      if (oneBurstReturn >= ballsPerBurst) burstWinCount += 1;
    }
    const rows = hitCounts.map((count, idx) => {
      const hitRate = (count / rounds) * 100;
      const avgReturn = (count / (rounds * ballsPerBurst)) * multipliers[idx] * 100;
      return {
        slot: idx,
        hits: count,
        hitRate,
        multiplier: multipliers[idx],
        contribution: avgReturn
      };
    });
    const avgSingleRtp = (totalReturn / (rounds * ballsPerBurst)) * 100;
    const avgBurstRtp = (burstTotalReturn / (rounds * ballsPerBurst)) * 100;
    const avgBurstNet = avgBurstRtp - 100;
    return {
      rows,
      summary: {
        rounds,
        ballsPerBurst,
        avgSingleRtp,
        avgBurstRtp,
        avgBurstNet,
        burstWinRate: (burstWinCount / rounds) * 100,
        bestBurstReturn: Math.max(...burstReturns),
        worstBurstReturn: Math.min(...burstReturns)
      }
    };
  }

  function showPlinkoSimulationOverlay() {
    hideSimulationOverlay();
    const ballsPerBurst = IS_INDEX2_MODE ? Math.max(1, Math.min(12, Math.floor(plinko.visualBallCount))) : 1;
    const report = runPlinkoMonteCarloReport(10000, ballsPerBurst);
    const rowsHtml = report.rows
      .map(
        (r) => `
          <tr>
            <td>${r.slot}</td>
            <td>${r.hits}/${10000 * ballsPerBurst}</td>
            <td>${r.hitRate.toFixed(2)}%</td>
            <td>${r.multiplier.toFixed(2)}x</td>
            <td>${r.contribution.toFixed(2)}%</td>
          </tr>
        `
      )
      .join("");
    const overlay = document.createElement("section");
    overlay.className = "result-global-overlay win";
    overlay.innerHTML = `
      <div class="sim-result">
        <h3>Plinko 10,000 次連發模擬（Rows=${plinko.rows}, Risk=${plinko.risk}）</h3>
        <p>每次連發球數：${report.summary.ballsPerBurst} 顆 ｜ 每次總下注 = 單顆下注 × ${report.summary.ballsPerBurst}</p>
        <p>單顆平均回收率：${report.summary.avgSingleRtp.toFixed(2)}% ｜ 連發平均淨利率：<span class="${report.summary.avgBurstNet < 0 ? "coin-negative" : "coin-value"}">${report.summary.avgBurstNet.toFixed(2)}%</span></p>
        <p>連發回本機率（總回收 ≥ 總下注）：${report.summary.burstWinRate.toFixed(2)}% ｜ 最佳/最差連發回收倍率：${report.summary.bestBurstReturn.toFixed(2)}x / ${report.summary.worstBurstReturn.toFixed(2)}x</p>
        <table>
          <thead>
            <tr>
              <th>落點槽位</th>
              <th>命中局數</th>
              <th>命中率</th>
              <th>倍率</th>
              <th>回收率貢獻</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="stats-actions" style="margin-top:10px;">
          <button id="closeSimBtn" class="cta-btn">關閉</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    simulationOverlayNode = overlay;
    overlay.querySelector("#closeSimBtn")?.addEventListener("click", hideSimulationOverlay);
  }

  function appendGameHistory(result, coinDelta, multiplier, winRate, gameName = "Mines 5x5") {
    state.gameHistory.push({
      gameName,
      source: roundSource,
      result,
      coinDelta: Number(coinDelta.toFixed(2)),
      multiplier: Number(multiplier.toFixed(4)),
      winRate: Number(winRate.toFixed(2))
    });
    if (state.gameHistory.length > 40) state.gameHistory.shift();
  }

  function scheduleBackToFocus() {
    if (lockBackTimeoutId) clearTimeout(lockBackTimeoutId);
    lockBackTimeoutId = setTimeout(() => {
      resultScreen = null;
      hideResultOverlay();
      lockBackTimeoutId = null;
      goToBreakMode();
    }, 4000);
  }

  function goToBreakMode() {
    stopTimer();
    stopPlinkoBurstSettleTimer();
    activeRound = false;
    mines = [];
    revealed = new Set();
    currentMultiplier = 1;
    plinko.active = false;
    plinko.animating = false;
    plinko.roundDeducted = false;
    plinko.burstRounds = [];
    plinko.burstSettledCount = 0;
    plinko.burstTotalStake = 0;
    plinko.burstProfitAccum = 0;
    resultScreen = null;
    hideResultOverlay();
    hideSimulationOverlay();
    lastStatus = "休息一下，準備下一輪。";
    state.mode = "break";
    state.running = false;
    state.paused = false;
    state.justFinishedFocus = false;
    state.totalSeconds = BREAK_SECONDS;
    state.remainingSeconds = BREAK_SECONDS;
    currentView = "focus";
    applyTheme();
    applyLayout();
    updateRing();
    updateLabels();
    gambleMount.innerHTML = "";
    saveState();
  }

  function hideResultOverlay() {
    if (resultOverlayNode) {
      resultOverlayNode.remove();
      resultOverlayNode = null;
    }
  }

  function hideSimulationOverlay() {
    if (simulationOverlayNode) {
      simulationOverlayNode.remove();
      simulationOverlayNode = null;
    }
  }

  function stopPlinkoBurstSettleTimer() {
    if (plinkoBurstSettleTimerId) {
      clearInterval(plinkoBurstSettleTimerId);
      plinkoBurstSettleTimerId = null;
    }
  }

  function renderResultOverlay() {
    hideResultOverlay();
    if (!resultScreen) return;
    const overlay = document.createElement("section");
    overlay.className = "result-global-overlay neutral";
    overlay.innerHTML = `
      <div class="result-content">
        <div class="${resultScreen.type === "win" ? "burst-gems" : "sad-face"}">${resultScreen.type === "win" ? "✨✨✨" : "🙂"}</div>
        <h2>${resultScreen.text || "本局結算"}</h2>
        <p>${resultScreen.type === "win" ? "本局為正收益。" : "本局為負收益。"}</p>
        <p>該局勝率：${resultScreen.winRate.toFixed(2)}%</p>
        <p>最終倍率：${resultScreen.multiplier.toFixed(4)}x</p>
      </div>
    `;
    document.body.appendChild(overlay);
    resultOverlayNode = overlay;
  }

  function endRoundByLoss() {
    activeRound = false;
    const coinDelta = -currentStake;
    state.netVirtualCoins = Number((state.netVirtualCoins + coinDelta).toFixed(2));
    appendGameHistory("失敗", coinDelta, currentMultiplier, currentRoundWinRate(), "Mines 5x5");
    resultScreen = {
      type: "lose",
      text: "失敗了 QQ",
      winRate: currentRoundWinRate(),
      multiplier: currentMultiplier
    };
    playLoseSfx();
    lastStatus = "踩到地雷，這局爆炸失敗。";
    saveState();
    renderMinesPanel();
    renderResultOverlay();
    scheduleBackToFocus();
  }

  function cashOut() {
    if (!activeRound || revealed.size === 0) return;
    activeRound = false;
    const payout = expectedPayout(currentMultiplier);
    const profit = payout - currentStake;
    state.virtualCoins = Number((state.virtualCoins + payout).toFixed(2));
    state.netVirtualCoins = Number((state.netVirtualCoins + profit).toFixed(2));
    appendGameHistory("勝利", profit, currentMultiplier, currentRoundWinRate(), "Mines 5x5");
    resultScreen = {
      type: "win",
      text: "勝利！寶石噴發！",
      winRate: currentRoundWinRate(),
      multiplier: currentMultiplier
    };
    playWinSfx();
    lastStatus = `成功兌現，帶走 ${payout.toFixed(2)} 虛擬幣（淨利 ${profit.toFixed(2)}）。`;
    saveState();
    renderMinesPanel();
    renderResultOverlay();
    scheduleBackToFocus();
  }

  function revealAllCells(boardEl) {
    const buttons = boardEl.querySelectorAll(".mine-cell");
    buttons.forEach((button) => {
      const idx = Number(button.dataset.index);
      const isMine = mines[idx];
      button.disabled = true;
      if (isMine) {
        button.textContent = "💣";
        button.classList.add("revealed-mine");
      } else {
        button.textContent = "💎";
        button.classList.add("revealed-gem");
      }
    });
  }

  function startBet() {
    if (state.mode !== "gamble" || !state.justFinishedFocus) return;
    if (activeRound) return;
    if (!Number.isFinite(currentStake)) currentStake = MIN_BET;
    currentStake = Math.max(MIN_BET, Number(currentStake.toFixed(2)));
    if (state.tokens < BET_COST_TOKEN || state.virtualCoins < currentStake) {
      lastStatus = "餘額不足或能量不足，無法開局。";
      renderMinesPanel();
      return;
    }

    state.tokens -= BET_COST_TOKEN;
    state.virtualCoins = Number((state.virtualCoins - currentStake).toFixed(2));
    // 這行在扣款後立刻關閉「餘額不足」提示，避免玩家誤以為本局已開局卻被判定不足。
    lastStatus = "已投注，開始翻牌。";
    revealed = new Set();
    currentMultiplier = 1;
    resultScreen = null;
    roundSource = state.justFinishedFocus ? roundSource : "測試模式";
    // lastStatus 已在扣款後先設定，避免中間狀態閃爍。

    const indexes = Array.from({ length: BOARD_SIZE }, (_, i) => i);
    const shuffled = secureShuffle(indexes);
    mines = Array.from({ length: BOARD_SIZE }, () => false);
    shuffled.slice(0, mineCount).forEach((idx) => {
      mines[idx] = true;
    });

    activeRound = true;
    saveState();
    renderMinesPanel();
  }

  function buildPlinkoMultipliers(rows, risk) {
    const bins = rows + 1;
    const center = rows / 2;
    // 這段用「距離中心越遠，權重越爆炸」來塑形倍率曲線；最後會用二項分佈機率做正規化，確保長期期望回收率 ≈ 1。
    // 想要 100x、400x 這種「刺激」本質上是把極端小機率事件的倍率拉很高，同時把常見落點的倍率壓低，讓 Σ(P×M) 仍然回到 1。
    const strength = risk === "low" ? 1.15 : risk === "high" ? 3.8 : 2.3; // 風險越高，兩側尾端倍率越極端。
    const power = risk === "low" ? 2.2 : risk === "high" ? 1.15 : 1.6; // 高風險讓尾端成長更快（但不至於無限爆炸）。
    const baseFloor = risk === "low" ? 0.72 : risk === "high" ? 0.22 : 0.45; // 高風險把常見落點壓低，換取兩側大倍率。
    const baseWeights = Array.from({ length: bins }, (_, idx) => {
      const distance = Math.abs(idx - center) / Math.max(1, center); // 0（中心）～ 1（最外側）
      const shaped = Math.pow(distance, power);
      return baseFloor + Math.exp(strength * shaped) - 1;
    });
    const expected = baseWeights.reduce((sum, weight, idx) => {
      const prob = plinkoLandingProbability(rows, idx) / 100;
      return sum + prob * weight;
    }, 0);
    const scale = expected > 0 ? 1 / expected : 1;
    const scaled = baseWeights.map((weight) => weight * scale);
    // 這行做上限保護避免 UI 顯示爆掉（理論上 rows=16 的外側機率極小，倍率可以非常高）。
    const cap = risk === "high" ? 500 : risk === "medium" ? 120 : 35;
    return scaled.map((value) => Number(Math.min(cap, value).toFixed(4)));
  }

  function buildPlinkoGeometry(width, height, rows) {
    const topY = 50;
    const bottomY = height - 82;
    const centerX = width / 2;
    const boardWidth = Math.min(width - 76, rows * 34 + 120);
    const xStep = boardWidth / Math.max(1, rows);
    const rowGap = (bottomY - topY) / Math.max(1, rows);
    const pegs = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: row + 1 }, (_, col) => ({
        x: centerX - ((row) * xStep) / 2 + col * xStep,
        y: topY + row * rowGap
      }))
    );
    const bins = rows + 1;
    const binWidth = boardWidth / bins;
    const binLeft = centerX - boardWidth / 2;
    return { topY, bottomY, centerX, xStep, rowGap, pegs, bins, binWidth, binLeft };
  }

  function plinkoLandingProbability(rows, rightMoves) {
    // 這行使用二項分佈 C(n,k)/2^n，n 為總碰撞次數、k 為向右次數。
    const combinations = combination(rows, rightMoves);
    // 這行把路徑總樣本空間 2^n 納入分母，得到該槽理論機率。
    return (combinations / 2 ** rows) * 100;
  }

  function generatePlinkoPath(rows) {
    const path = [];
    for (let i = 0; i < rows; i += 1) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer); // 使用安全亂數決定每次碰釘後向左或向右。
      path.push(buffer[0] % 2);
    }
    return path;
  }

  function settlePlinkoRound() {
    const rights = plinko.path.reduce((sum, step) => sum + step, 0);
    const multipliers = buildPlinkoMultipliers(plinko.rows, plinko.risk);
    const landedMultiplier = multipliers[rights];
    const payout = Number((plinko.stakeAtRound * landedMultiplier).toFixed(2));
    const profit = Number((payout - plinko.stakeAtRound).toFixed(2));
    const winRate = plinkoLandingProbability(plinko.rows, rights);
    state.virtualCoins = Number((state.virtualCoins + payout).toFixed(2));
    state.netVirtualCoins = Number((state.netVirtualCoins + profit).toFixed(2));
    appendGameHistory("結算", profit, landedMultiplier, winRate, "Plinko");
    const win = profit >= 0;
    resultScreen = {
      type: win ? "win" : "lose",
      text: win ? "Plinko 中獎！" : "Plinko 未中獎",
      winRate,
      multiplier: landedMultiplier
    };
    lastStatus = `Plinko 落點倍率 ${landedMultiplier.toFixed(2)}x，${win ? "本局盈利" : "本局虧損"} ${profit.toFixed(2)}。`;
    plinko.active = false;
    plinko.animating = false;
    plinko.phase = "idle";
    plinko.roundDeducted = false;
    saveState();
    renderResultOverlay();
    scheduleBackToFocus();
  }

  function settleSinglePlinkoBall(landedMultiplier, winRate, finalBall = false) {
    const payout = Number((plinko.stakeAtRound * landedMultiplier).toFixed(2));
    const profit = Number((payout - plinko.stakeAtRound).toFixed(2));
    state.virtualCoins = Number((state.virtualCoins + payout).toFixed(2));
    state.netVirtualCoins = Number((state.netVirtualCoins + profit).toFixed(2));
    plinko.burstProfitAccum = Number((plinko.burstProfitAccum + profit).toFixed(2));
    appendGameHistory("結算", profit, landedMultiplier, winRate, "Plinko");
    const win = profit >= 0;
    const progress = `${plinko.burstSettledCount}/${Math.max(1, plinko.burstRounds.length)}`;
    if (IS_INDEX2_MODE && !finalBall) {
      // index2 多球模式：中間球只更新即時進度，不彈最終結算遮罩。
      lastStatus = `第 ${progress} 顆入洞：${landedMultiplier.toFixed(2)}x（本顆${win ? "盈利" : "虧損"} ${profit.toFixed(2)}，累計 ${plinko.burstProfitAccum.toFixed(2)}）`;
      if (plinkoUi.warnLine) {
        plinkoUi.warnLine.textContent = lastStatus;
        plinkoUi.warnLine.classList.remove("hidden-lock");
      }
      saveState();
      updateLabels();
      return;
    }
    const finalProfit = IS_INDEX2_MODE ? plinko.burstProfitAccum : profit;
    resultScreen = {
      type: finalProfit >= 0 ? "win" : "lose",
      text: finalProfit >= 0 ? "Plinko 連發結算：盈利" : "Plinko 連發結算：虧損",
      winRate,
      multiplier: landedMultiplier
    };
    lastStatus = IS_INDEX2_MODE
      ? `最後一顆入洞，連發累計 ${finalProfit.toFixed(2)}`
      : `Plinko 落點倍率 ${landedMultiplier.toFixed(2)}x，${win ? "本局盈利" : "本局虧損"} ${profit.toFixed(2)}。`;
    saveState();
    updateLabels();
    renderResultOverlay();
    if (finalBall) {
      plinko.active = false;
      plinko.animating = false;
      plinko.phase = "idle";
      plinko.roundDeducted = false;
      plinko.burstRounds = [];
      plinko.burstSettledCount = 0;
      plinko.burstTotalStake = 0;
      plinko.burstProfitAccum = 0;
      scheduleBackToFocus();
    }
  }

  function plinkoBallColor(risk) {
    // 這行根據風險等級給球不同顏色：低=黃、中=橘、高=紅，讓視覺即時辨識。
    if (risk === "low") return "#ffd65a";
    if (risk === "high") return "#ff3b30";
    return "#ff9f0a";
  }

  function animatePlinko(canvas, ctx) {
    if (plinkoUi.activeCanvas !== canvas) {
      plinkoRafId = null;
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    const geo = buildPlinkoGeometry(width, height, plinko.rows);
    const topY = geo.topY;
    const centerX = geo.centerX;
    const multipliers = buildPlinkoMultipliers(plinko.rows, plinko.risk);
    const now = performance.now();
    try {
      if (plinko.animating) {
        const ease = (t) => t * t * (3 - 2 * t); // 單調遞增的 smoothstep，避免分段切換時 y 方向回跳。
        const sumRights = (count) => {
          let sum = 0;
          for (let i = 0; i < count; i += 1) sum += plinko.path[i] || 0;
          return sum;
        };
        const stepMs = 320;
        const dropMs = 420;
        const totalMs = plinko.rows * stepMs + dropMs;

        const poseAtPath = (path, elapsedMs) => {
          const sumPathRights = (count) => {
            let sum = 0;
            for (let i = 0; i < count; i += 1) sum += path[i] || 0;
            return sum;
          };
          if (elapsedMs >= plinko.rows * stepMs) {
            const t0 = Math.min(1, Math.max(0, (elapsedMs - plinko.rows * stepMs) / dropMs));
            const t = ease(t0);
            const targetIndex = path.reduce((acc, step) => acc + step, 0);
            const pegCol = sumPathRights(plinko.rows - 1);
            const from = geo.pegs[plinko.rows - 1][pegCol];
            const to = {
              x: geo.binLeft + geo.binWidth * targetIndex + geo.binWidth / 2,
              y: height - 30
            };
            return {
              x: from.x + (to.x - from.x) * t,
              y: from.y + (to.y - from.y) * t,
              pegRow: plinko.rows - 1,
              pegCol,
              targetIndex,
              done: t0 >= 1
            };
          }
          const stepIndex = Math.min(plinko.rows - 1, Math.max(0, Math.floor(elapsedMs / stepMs)));
          const localT = Math.min(1, Math.max(0, (elapsedMs % stepMs) / stepMs));
          const prevCol = stepIndex === 0 ? 0 : sumPathRights(stepIndex);
          const currentCol = sumPathRights(stepIndex + 1);
          const from = stepIndex === 0
            ? { x: centerX, y: topY - 24 }
            : geo.pegs[stepIndex - 1][prevCol];
          const to = geo.pegs[stepIndex][currentCol];
          const t = ease(localT);
          return {
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
            pegRow: stepIndex,
            pegCol: currentCol,
            targetIndex: path.reduce((acc, step) => acc + step, 0),
            done: false
          };
        };

        if (IS_INDEX2_MODE && plinko.burstRounds.length > 0) {
          let leadPose = null;
          for (let i = 0; i < plinko.burstRounds.length; i += 1) {
            const round = plinko.burstRounds[i];
            const elapsedMs = now - round.startAt;
            if (elapsedMs < 0) continue;
            const pose = poseAtPath(round.path, elapsedMs);
            // 只用「尚未結算的最前球」當主球，避免第一顆結束後主球看起來卡住。
            if (!leadPose && !round.settled) leadPose = pose;
          }
          // 若全部已結算，退回第一顆 pose，讓主球仍有可畫座標。
          if (!leadPose && plinko.burstRounds.length > 0) {
            const fallback = plinko.burstRounds[0];
            leadPose = poseAtPath(fallback.path, Math.max(0, now - fallback.startAt));
          }

          if (leadPose) {
            plinko.ballX = leadPose.x;
            plinko.ballY = Math.max(plinko.ballY, leadPose.y);
            plinko.activePegRow = leadPose.pegRow;
            plinko.activePegCol = leadPose.pegCol;
            plinko.pegFlashUntil = now + 70;
          }
        } else {

        const poseAt = (elapsedMs) => {
          if (plinko.phase === "drop") {
            const t0 = Math.min(1, Math.max(0, (elapsedMs - plinko.rows * stepMs) / dropMs));
            const t = ease(t0);
            const pegCol = sumRights(plinko.rows - 1);
            const from = geo.pegs[plinko.rows - 1][pegCol];
            const to = {
              x: geo.binLeft + geo.binWidth * plinko.targetIndex + geo.binWidth / 2,
              y: height - 30
            };
            return {
              x: from.x + (to.x - from.x) * t,
              y: from.y + (to.y - from.y) * t,
              pegRow: plinko.rows - 1,
              pegCol,
              done: t0 >= 1
            };
          }

          const stepIndex = Math.min(plinko.rows - 1, Math.max(0, Math.floor(elapsedMs / stepMs)));
          const localT = Math.min(1, Math.max(0, (elapsedMs % stepMs) / stepMs));
          const prevCol = stepIndex === 0 ? 0 : sumRights(stepIndex);
          const currentCol = sumRights(stepIndex + 1);
          const from = stepIndex === 0
            ? { x: centerX, y: topY - 24 }
            : geo.pegs[stepIndex - 1][prevCol];
          const to = geo.pegs[stepIndex][currentCol];
          const t = ease(localT);
          return {
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
            pegRow: stepIndex,
            pegCol: currentCol,
            done: false
          };
        };

        const leadElapsed = now - plinko.startTime;
        if (leadElapsed >= plinko.rows * stepMs && plinko.phase !== "drop") {
          plinko.phase = "drop";
          plinko.dropStartMs = now;
          plinko.activePegRow = plinko.rows - 1;
          plinko.activePegCol = sumRights(plinko.rows - 1);
          plinko.pegFlashUntil = now + 180;
        }

        const lead = poseAt(leadElapsed);
        plinko.ballX = lead.x;
        plinko.ballY = Math.max(plinko.ballY, lead.y); // 保險：避免極端浮點誤差造成回跳。
        plinko.activePegRow = lead.pegRow;
        plinko.activePegCol = lead.pegCol;
        plinko.pegFlashUntil = now + 70;

        if (plinko.phase === "drop" && lead.done && !plinko.settled) {
          plinko.settled = true;
          plinko.laneFlashUntil = now + 420;
          setTimeout(() => {
            settlePlinkoRound();
          }, 420);
        }
        }
      }
    } catch {
      // 若動畫計算意外出錯（例如索引越界），立即復位避免畫面凍結。
      if (plinko.roundDeducted) {
        // 這行把本局已扣除的資源退回，避免「沒玩到但 Token/下注被吃掉」。
        state.tokens += BET_COST_TOKEN;
        const refundCoins = IS_INDEX2_MODE ? plinko.burstTotalStake : plinko.stakeAtRound;
        state.virtualCoins = Number((state.virtualCoins + refundCoins).toFixed(2));
        plinko.roundDeducted = false;
        saveState();
        updateLabels();
      }
      stopPlinkoBurstSettleTimer();
      plinko.animating = false;
      plinko.active = false;
      plinko.phase = "idle";
      plinko.settled = false;
      plinko.dropStartMs = 0;
      plinko.burstRounds = [];
      plinko.burstSettledCount = 0;
      plinko.burstTotalStake = 0;
      plinko.burstProfitAccum = 0;
      if (plinkoUi.warnLine) {
        plinkoUi.warnLine.textContent = "Plinko 動畫異常，已自動復位，請再試一次";
        plinkoUi.warnLine.classList.remove("hidden-lock");
      }
      if (plinkoUi.betBtn) {
        const insufficient = state.virtualCoins < currentStake;
        plinkoUi.betBtn.disabled = insufficient || state.tokens < BET_COST_TOKEN;
        plinkoUi.betBtn.classList.remove("active-round");
      }
    }

    ctx.clearRect(0, 0, width, height);

    for (let row = 0; row < plinko.rows; row += 1) {
      const pegs = row + 1;
      for (let col = 0; col < pegs; col += 1) {
        const peg = geo.pegs[row][col];
        const isHit =
          row === plinko.activePegRow &&
          col === plinko.activePegCol &&
          plinko.pegFlashUntil > now;
        ctx.beginPath();
        ctx.fillStyle = isHit ? "rgba(255,220,120,0.95)" : "rgba(210,210,210,0.55)";
        ctx.shadowColor = isHit ? "rgba(255,220,120,0.95)" : "rgba(255,255,255,0.26)";
        ctx.shadowBlur = isHit ? 12 : 6;
        ctx.arc(peg.x, peg.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < geo.bins; i += 1) {
      const distance = Math.abs(i - plinko.rows / 2) / Math.max(1, plinko.rows / 2);
      const red = Math.round(80 + distance * 150);
      const blue = Math.round(210 - distance * 120);
      const isLanded = i === plinko.targetIndex && plinko.laneFlashUntil > now;
      ctx.fillStyle = isLanded ? "rgba(255, 214, 90, 0.95)" : `rgba(${red}, 120, ${blue}, 0.65)`;
      ctx.fillRect(geo.binLeft + i * geo.binWidth + 1, height - 46, geo.binWidth - 2, 34);
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(`${multipliers[i].toFixed(2)}x`, geo.binLeft + i * geo.binWidth + geo.binWidth / 2, height - 24);
    }

    if (plinko.active || plinko.animating) {
      const stepMs = 320;
      const dropMs = 420;
      const intervalMs = 300; // 你要的 0.3 秒間隔連發（純視覺，不影響結算）。
      const baseColor = plinkoBallColor(plinko.risk);
      const count = Math.max(1, Math.min(12, Math.floor(plinko.visualBallCount)));

      if (IS_INDEX2_MODE && plinko.burstRounds.length > 0) {
        for (let n = 0; n < plinko.burstRounds.length; n += 1) {
          const round = plinko.burstRounds[n];
          const tNow = Math.max(0, now - round.startAt);
          if (now < round.startAt) continue;
          const path = round.path;
          const targetIndex = round.targetIndex;
          const alpha = round.settled ? 0.18 : 0.92;
          const radius = round.settled ? 4.8 : 5.6;
          const ease = (t) => t * t * (3 - 2 * t);
          const sumRights = (c) => {
            let sum = 0;
            for (let i = 0; i < c; i += 1) sum += path[i] || 0;
            return sum;
          };
          let x = centerX;
          let y = topY - 24;
          if (tNow >= plinko.rows * stepMs) {
            const t0 = Math.min(1, (tNow - plinko.rows * stepMs) / dropMs);
            const t = ease(t0);
            const pegCol = sumRights(plinko.rows - 1);
            const from = geo.pegs[plinko.rows - 1][pegCol];
            const to = {
              x: geo.binLeft + geo.binWidth * targetIndex + geo.binWidth / 2,
              y: height - 30
            };
            x = from.x + (to.x - from.x) * t;
            y = from.y + (to.y - from.y) * t;
          } else {
            const stepIndex = Math.min(plinko.rows - 1, Math.floor(tNow / stepMs));
            const localT = Math.min(1, (tNow % stepMs) / stepMs);
            const prevCol = stepIndex === 0 ? 0 : sumRights(stepIndex);
            const currentCol = sumRights(stepIndex + 1);
            const from = stepIndex === 0
              ? { x: centerX, y: topY - 24 }
              : geo.pegs[stepIndex - 1][prevCol];
            const to = geo.pegs[stepIndex][currentCol];
            const t = ease(localT);
            x = from.x + (to.x - from.x) * t;
            y = from.y + (to.y - from.y) * t;
          }
          ctx.beginPath();
          ctx.fillStyle = baseColor;
          ctx.globalAlpha = alpha;
          ctx.shadowColor = baseColor;
          ctx.shadowBlur = 14;
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let n = count - 1; n >= 0; n -= 1) {
          const delay = n * intervalMs;
          const tNow = Math.max(0, now - plinko.startTime - delay);
        const ease = (t) => t * t * (3 - 2 * t);
        const sumRights = (c) => {
          let sum = 0;
          for (let i = 0; i < c; i += 1) sum += plinko.path[i] || 0;
          return sum;
        };

        let x = centerX;
        let y = topY - 24;
        if (tNow >= plinko.rows * stepMs) {
          const t0 = Math.min(1, (tNow - plinko.rows * stepMs) / dropMs);
          const t = ease(t0);
          const pegCol = sumRights(plinko.rows - 1);
          const from = geo.pegs[plinko.rows - 1][pegCol];
          const to = {
            x: geo.binLeft + geo.binWidth * plinko.targetIndex + geo.binWidth / 2,
            y: height - 30
          };
          x = from.x + (to.x - from.x) * t;
          y = from.y + (to.y - from.y) * t;
        } else {
          const stepIndex = Math.min(plinko.rows - 1, Math.floor(tNow / stepMs));
          const localT = Math.min(1, (tNow % stepMs) / stepMs);
          const prevCol = stepIndex === 0 ? 0 : sumRights(stepIndex);
          const currentCol = sumRights(stepIndex + 1);
          const from = stepIndex === 0
            ? { x: centerX, y: topY - 24 }
            : geo.pegs[stepIndex - 1][prevCol];
          const to = geo.pegs[stepIndex][currentCol];
          const t = ease(localT);
          x = from.x + (to.x - from.x) * t;
          y = from.y + (to.y - from.y) * t;
        }

        const alpha = 0.22 + (1 - n / Math.max(1, count - 1)) * 0.78;
        ctx.beginPath();
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 14;
        ctx.arc(x, y, 5.6, 0, Math.PI * 2);
        ctx.fill();
      }
      }
      ctx.globalAlpha = 1;
    }

    if (currentView === "game" && selectedGame === "plinko") {
      plinkoRafId = requestAnimationFrame(() => animatePlinko(canvas, ctx));
    } else {
      plinkoRafId = null;
    }
  }

  function startPlinkoBet() {
    if (plinko.animating || plinko.active) return;
    if (!Number.isFinite(currentStake)) currentStake = MIN_BET;
    currentStake = Math.max(MIN_BET, Number(currentStake.toFixed(2)));
    const burstCount = Math.max(1, Math.min(12, Math.floor(plinko.visualBallCount)));
    const requiredCoins = getPlinkoRequiredCoins(currentStake, burstCount);
    if (state.tokens < BET_COST_TOKEN || state.virtualCoins < requiredCoins) {
      if (plinkoUi.warnLine) {
        plinkoUi.warnLine.textContent =
          state.tokens < BET_COST_TOKEN
            ? "專注能量不足，請先完成番茄鐘"
            : IS_INDEX2_MODE
              ? `餘額不足（連發需要 ${requiredCoins.toFixed(2)} 幣）`
              : "餘額不足";
        plinkoUi.warnLine.classList.remove("hidden-lock");
      }
      return;
    }
    state.tokens -= BET_COST_TOKEN;
    state.virtualCoins = Number((state.virtualCoins - requiredCoins).toFixed(2));
    plinko.path = generatePlinkoPath(plinko.rows);
    plinko.targetIndex = plinko.path.reduce((sum, step) => sum + step, 0);
    plinko.active = true;
    plinko.animating = true;
    plinko.startTime = performance.now();
    plinko.phase = "pegs";
    plinko.dropStartMs = 0;
    plinko.settled = false;
    plinko.ballX = 360;
    plinko.ballY = 30;
    plinko.stakeAtRound = currentStake;
    plinko.roundDeducted = true;
    plinko.burstTotalStake = requiredCoins;
    plinko.burstProfitAccum = 0;
    if (IS_INDEX2_MODE) {
      stopPlinkoBurstSettleTimer();
      const stepMs = 320;
      const dropMs = 420;
      const totalMs = plinko.rows * stepMs + dropMs;
      plinko.burstRounds = Array.from({ length: burstCount }, (_, idx) => {
        const path = generatePlinkoPath(plinko.rows);
        return {
          path,
          targetIndex: path.reduce((sum, step) => sum + step, 0),
          startAt: plinko.startTime + idx * 300,
          settleAt: plinko.startTime + idx * 300 + totalMs,
          settled: false
        };
      });
      plinko.burstSettledCount = 0;
      plinko.path = plinko.burstRounds[0].path.slice();
      plinko.targetIndex = plinko.burstRounds[0].targetIndex;
      plinkoBurstSettleTimerId = setInterval(() => {
        if (!plinko.active || !plinko.animating) {
          stopPlinkoBurstSettleTimer();
          return;
        }
        const now = performance.now();
        const nextRound = plinko.burstRounds.find((r) => !r.settled && now >= r.settleAt);
        if (!nextRound) return;
        nextRound.settled = true;
        plinko.burstSettledCount += 1;
        const multipliers = buildPlinkoMultipliers(plinko.rows, plinko.risk);
        const landedMultiplier = multipliers[nextRound.targetIndex];
        const winRate = plinkoLandingProbability(plinko.rows, nextRound.targetIndex);
        const isFinal = plinko.burstSettledCount >= plinko.burstRounds.length;
        plinko.laneFlashUntil = now + 420;
        plinko.targetIndex = nextRound.targetIndex;
        settleSinglePlinkoBall(landedMultiplier, winRate, isFinal);
        if (isFinal) stopPlinkoBurstSettleTimer();
      }, 24);
    } else {
      stopPlinkoBurstSettleTimer();
      plinko.burstRounds = [];
      plinko.burstSettledCount = 0;
    }
    plinko.activePegRow = -1;
    plinko.activePegCol = -1;
    plinko.pegFlashUntil = 0;
    plinko.laneFlashUntil = 0;
    roundSource = state.justFinishedFocus ? roundSource : "測試模式";
    saveState();
    if (plinkoUi.betBtn) {
      plinkoUi.betBtn.disabled = true;
      plinkoUi.betBtn.classList.add("active-round");
    }
    if (plinkoUi.warnLine) plinkoUi.warnLine.classList.add("hidden-lock");
  }

  function renderPlinkoPanel() {
    gambleMount.innerHTML = "";
    if (state.mode !== "gamble" || !state.justFinishedFocus || selectedGame !== "plinko") return;
    if (plinkoRafId) {
      cancelAnimationFrame(plinkoRafId);
      plinkoRafId = null;
    }
    const panel = document.createElement("section");
    panel.className = "gamble-panel card rgb-breath";
    panel.innerHTML = `
      <h2>Plinko</h2>
      <div class="mines-layout">
        <aside class="mines-sidebar">
          <h3>控制面板</h3>
          <p>錢包餘額：${state.virtualCoins.toFixed(2)} 虛擬幣</p>
          <label for="plinkoRows">行數（8-16）</label>
          <input id="plinkoRows" type="range" min="8" max="16" value="${plinko.rows}" />
          <p id="plinkoRowsText">目前行數：${plinko.rows}</p>
          <label>風險等級</label>
          <div id="plinkoRiskGroup" class="risk-group">
            <button class="risk-chip ${plinko.risk === "low" ? "active" : ""}" data-risk="low">低風險</button>
            <button class="risk-chip ${plinko.risk === "medium" ? "active" : ""}" data-risk="medium">中風險</button>
            <button class="risk-chip ${plinko.risk === "high" ? "active" : ""}" data-risk="high">高風險</button>
          </div>
          <label for="plinkoBallCount">連發球數</label>
          <input id="plinkoBallCount" type="range" min="1" max="12" value="${plinko.visualBallCount}" />
          <p id="plinkoBallCountText">目前球數：${plinko.visualBallCount} 顆（每 0.3 秒落下一顆）</p>
          <label for="plinkoStake">投注金額</label>
          <input id="plinkoStake" class="stake-input" type="number" min="${MIN_BET}" step="0.01" placeholder="${MIN_BET}" />
          <p id="plinkoPreview"></p>
          <button id="plinkoSimBtn" class="ghost-btn">模擬 10,000 局（Plinko）</button>
          <p id="plinkoWarn" class="stake-warning hidden-lock">餘額不足</p>
          <button id="plinkoBetBtn" class="bet-btn">${getPlinkoBetButtonText(currentStake, plinko.visualBallCount)}</button>
        </aside>
        <div class="plinko-stage">
          <canvas id="plinkoCanvas" class="plinko-canvas" width="720" height="520"></canvas>
        </div>
      </div>
    `;
    gambleMount.appendChild(panel);
    const rowsInput = panel.querySelector("#plinkoRows");
    const rowsText = panel.querySelector("#plinkoRowsText");
    const riskGroup = panel.querySelector("#plinkoRiskGroup");
    const ballCountInput = panel.querySelector("#plinkoBallCount");
    const ballCountText = panel.querySelector("#plinkoBallCountText");
    const stakeInput = panel.querySelector("#plinkoStake");
    const previewLine = panel.querySelector("#plinkoPreview");
    const warn = panel.querySelector("#plinkoWarn");
    const betBtn = panel.querySelector("#plinkoBetBtn");
    const simBtn = panel.querySelector("#plinkoSimBtn");
    const canvas = panel.querySelector("#plinkoCanvas");
    const ctx = canvas.getContext("2d");
    plinkoUi.canvas = canvas;
    plinkoUi.ctx = ctx;
    plinkoUi.previewLine = previewLine;
    plinkoUi.warnLine = warn;
    plinkoUi.betBtn = betBtn;
    plinkoUi.binsNode = null;
    plinkoUi.activeCanvas = canvas;

    const updatePlinkoPreview = () => {
      const multipliers = buildPlinkoMultipliers(plinko.rows, plinko.risk);
      const expected = multipliers.reduce((sum, m, idx) => {
        const prob = plinkoLandingProbability(plinko.rows, idx) / 100;
        return sum + m * prob;
      }, 0);
      previewLine.textContent = `預估單球期望回收：${expected.toFixed(3)}x（長期平均每 1 幣回收 ${expected.toFixed(3)} 幣）`;
    };

    rowsInput.addEventListener("input", () => {
      if (plinko.animating) return;
      plinko.rows = Math.max(8, Math.min(16, Number(rowsInput.value)));
      rowsText.textContent = `目前行數：${plinko.rows}`;
      updatePlinkoPreview();
      saveState();
      animatePlinko(canvas, ctx);
    });
    ballCountInput.addEventListener("input", () => {
      plinko.visualBallCount = Math.max(1, Math.min(12, Number(ballCountInput.value)));
      ballCountText.textContent = `目前球數：${plinko.visualBallCount} 顆（每 0.3 秒落下一顆）`;
      betBtn.textContent = getPlinkoBetButtonText(currentStake, plinko.visualBallCount);
      const requiredCoins = getPlinkoRequiredCoins(currentStake, plinko.visualBallCount);
      const insufficient = state.virtualCoins < requiredCoins;
      warn.classList.toggle("hidden-lock", plinko.animating || plinko.active || !insufficient);
      betBtn.disabled = insufficient || plinko.animating || plinko.active || state.tokens < BET_COST_TOKEN;
      if (insufficient) {
        warn.textContent = IS_INDEX2_MODE ? `餘額不足（連發需要 ${requiredCoins.toFixed(2)} 幣）` : "餘額不足";
      }
      saveState();
      animatePlinko(canvas, ctx);
    });
    riskGroup.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const risk = target.dataset.risk;
      if (!risk || plinko.animating) return;
      plinko.risk = risk;
      riskGroup.querySelectorAll(".risk-chip").forEach((chip) => {
        chip.classList.toggle("active", chip === target);
      });
      updatePlinkoPreview();
      saveState();
      animatePlinko(canvas, ctx);
    });
    stakeInput.addEventListener("input", () => {
      if (!stakeInput.value.trim()) currentStake = MIN_BET;
      else currentStake = Math.max(MIN_BET, Number(Number(stakeInput.value).toFixed(2)));
      betBtn.textContent = getPlinkoBetButtonText(currentStake, plinko.visualBallCount);
      const requiredCoins = getPlinkoRequiredCoins(currentStake, plinko.visualBallCount);
      const insufficient = state.virtualCoins < requiredCoins;
      warn.classList.toggle("hidden-lock", plinko.animating || plinko.active || !insufficient);
      betBtn.disabled = insufficient || plinko.animating || plinko.active || state.tokens < BET_COST_TOKEN;
      if (insufficient) {
        warn.textContent = IS_INDEX2_MODE ? `餘額不足（連發需要 ${requiredCoins.toFixed(2)} 幣）` : "餘額不足";
      }
    });
    betBtn.addEventListener("click", startPlinkoBet);
    simBtn.addEventListener("click", showPlinkoSimulationOverlay);

    const initialRequiredCoins = getPlinkoRequiredCoins(currentStake, plinko.visualBallCount);
    const insufficient = state.virtualCoins < initialRequiredCoins;
    warn.classList.toggle("hidden-lock", plinko.animating || plinko.active || !insufficient);
    betBtn.disabled = insufficient || plinko.animating || plinko.active || state.tokens < BET_COST_TOKEN;
    if (insufficient) {
      warn.textContent = IS_INDEX2_MODE ? `餘額不足（連發需要 ${initialRequiredCoins.toFixed(2)} 幣）` : "餘額不足";
    }
    betBtn.textContent = getPlinkoBetButtonText(currentStake, plinko.visualBallCount);
    updatePlinkoPreview();
    animatePlinko(canvas, ctx);
  }

  function renderGameSelector() {
    gambleMount.innerHTML = `
      <section class="gamble-panel card">
        <h2>選擇遊戲</h2>
        <div class="game-selector">
          <button class="game-card" data-game="mines">
            <h3>Mines 5x5</h3>
            <p>25 格掃雷，翻寶石提升倍率，踩雷即結束。</p>
          </button>
          <button class="game-card" data-game="plinko">
            <h3>Plinko</h3>
            <p>金球穿越釘點，落入倍率槽獲得回報。</p>
          </button>
        </div>
      </section>
    `;
    gambleMount.querySelectorAll("[data-game]").forEach((card) => {
      card.addEventListener("click", () => {
        selectedGame = card.getAttribute("data-game") || "mines";
        currentView = "game";
        applyLayout();
        if (selectedGame === "plinko") renderPlinkoPanel();
        else renderMinesPanel();
      });
    });
  }

  function onCellClick(index) {
    if (!activeRound) return;
    if (revealed.has(index)) return;

    if (mines[index]) {
      const panel = document.querySelector(".gamble-panel");
      if (panel) {
        panel.classList.add("shake");
        setTimeout(() => panel.classList.remove("shake"), 360);
      }
      lastStatus = "你踩到炸彈了！";
      endRoundByLoss();
      return;
    }

    revealed.add(index);
    currentMultiplier = calculateMultiplier(mineCount, revealed.size);
    lastStatus = `安全！目前倍率 ${currentMultiplier.toFixed(4)}x，隨時可兌現。`;
    saveState();
    renderMinesPanel();
  }

  function renderMinesPanel() {
    gambleMount.innerHTML = "";
    if (state.mode !== "gamble" || !state.justFinishedFocus || selectedGame !== "mines") return;

    const panel = document.createElement("section"); // 這行建立最外層遊戲容器，承接側欄與棋盤兩大區塊。
    panel.className = "gamble-panel card"; // 這行設定容器樣式類別，套用黑底與圓角玻璃風。
    panel.classList.add("rgb-breath");

    const title = document.createElement("h2"); // 這行建立標題節點，用來顯示遊戲名稱與規則定位。
    title.textContent = "Mines 5x5"; // 這行設定標題文字，讓玩家知道目前是掃雷玩法。
    panel.appendChild(title); // 這行把標題掛到容器，確保版面從上到下結構正確。

    const layout = document.createElement("div"); // 這行建立雙欄 layout 包裝層，左邊側欄右邊棋盤。
    layout.className = "mines-layout"; // 這行套用 Grid 版型 class，啟用響應式雙欄配置。
    panel.appendChild(layout); // 這行把 layout 插入主容器，後續子節點都放進來。

    const sidebar = document.createElement("aside"); // 這行建立側欄節點，用來放控制器與資訊。
    sidebar.className = "mines-sidebar"; // 這行套上側欄樣式，形成深色卡片區塊。
    layout.appendChild(sidebar); // 這行把側欄掛到 layout 左側。

    const sideTitle = document.createElement("h3"); // 這行建立側欄小標題節點。
    sideTitle.textContent = "控制面板"; // 這行填入小標題文字，提示玩家可操作區。
    sidebar.appendChild(sideTitle); // 這行把小標題插入側欄。

    const walletLine = document.createElement("p");
    walletLine.textContent = `錢包餘額：${state.virtualCoins.toFixed(2)} 虛擬幣`;
    sidebar.appendChild(walletLine);

    const mineLabel = document.createElement("label"); // 這行建立地雷數輸入的標籤節點。
    mineLabel.setAttribute("for", "mineCountRange"); // 這行綁定 label 與 input，提升可用性與可存取性。
    mineLabel.className = "mines-label";
    mineLabel.innerHTML = `地雷數量：<span class="mine-count-pill">${mineCount}</span>`; // 這行顯示目前地雷數，讓玩家知道風險等級。
    sidebar.appendChild(mineLabel); // 這行將標籤加入側欄。

    const mineRange = document.createElement("input"); // 這行建立地雷數滑桿 input 元件。
    mineRange.id = "mineCountRange"; // 這行設定 id 供 label 對應。
    mineRange.type = "range"; // 這行設定 input 類型為 range，提供連續拖曳調整。
    mineRange.min = "1"; // 這行限定最少 1 顆地雷，符合需求下限。
    mineRange.max = "24"; // 這行限定最多 24 顆地雷，符合需求上限。
    mineRange.value = String(mineCount); // 這行把目前狀態映射到滑桿顯示值。
    mineRange.disabled = activeRound; // 這行在對局中鎖定地雷數，避免中途改規則作弊。
    const multiLine = document.createElement("p"); // 這行建立倍率資訊段落節點。
    const nextMultiLine = document.createElement("p");
    const payoutLine = document.createElement("p"); // 這行建立預期收益顯示段落節點。

    mineRange.addEventListener("input", () => {
      mineCount = Math.max(1, Math.min(24, Number(mineRange.value)));
      mineLabel.innerHTML = `地雷數量：<span class="mine-count-pill">${mineCount}</span>`;
      currentMultiplier = calculateMultiplier(mineCount, revealed.size);
      multiLine.textContent = `目前倍率：${currentMultiplier.toFixed(4)}x`;
      nextMultiLine.textContent = `下一顆寶石後倍率：${calculateMultiplier(mineCount, revealed.size + 1).toFixed(4)}x`;
      payoutLine.textContent = `預期收益：${expectedPayout(currentMultiplier).toFixed(2)} 虛擬幣`;
      saveState();
    });
    sidebar.appendChild(mineRange); // 這行把滑桿放入側欄。

    const stakeLabel = document.createElement("label");
    stakeLabel.setAttribute("for", "stakeInput");
    stakeLabel.textContent = `投注金額（最低 ${MIN_BET}）`;
    sidebar.appendChild(stakeLabel);

    const stakeInput = document.createElement("input");
    stakeInput.id = "stakeInput";
    stakeInput.className = "stake-input";
    stakeInput.type = "number";
    stakeInput.min = String(MIN_BET);
    stakeInput.step = "0.01";
    stakeInput.value = "";
    stakeInput.placeholder = `${MIN_BET}`;
    stakeInput.disabled = activeRound;
    const stakeWarning = document.createElement("p");
    stakeWarning.className = "stake-warning hidden-lock";
    stakeWarning.textContent = "餘額不足";
    stakeInput.addEventListener("input", () => {
      if (!stakeInput.value.trim()) {
        currentStake = MIN_BET;
        payoutLine.textContent = `預期收益：${expectedPayout(currentMultiplier).toFixed(2)} 虛擬幣`;
        betButton.textContent = `投注（${currentStake.toFixed(2)} 幣）`;
        betButton.disabled = activeRound || state.tokens < BET_COST_TOKEN || state.virtualCoins < currentStake;
        stakeWarning.classList.add("hidden-lock");
        return;
      }
      const raw = Number(stakeInput.value);
      if (Number.isNaN(raw)) return;
      currentStake = Math.max(MIN_BET, Number(raw.toFixed(2)));
      payoutLine.textContent = `預期收益：${expectedPayout(currentMultiplier).toFixed(2)} 虛擬幣`;
      betButton.textContent = `投注（${currentStake.toFixed(2)} 幣）`;
      betButton.disabled = activeRound || state.tokens < BET_COST_TOKEN || state.virtualCoins < currentStake;
      if (state.virtualCoins < currentStake) {
        if (!activeRound) stakeWarning.classList.remove("hidden-lock");
      } else {
        stakeWarning.classList.add("hidden-lock");
      }
    });
    sidebar.appendChild(stakeInput);
    sidebar.appendChild(stakeWarning);

    multiLine.textContent = `目前倍率：${currentMultiplier.toFixed(4)}x`; // 這行把即時倍率輸出在側欄，方便決策。
    sidebar.appendChild(multiLine); // 這行把倍率段落加入側欄。

    nextMultiLine.textContent = `下一顆寶石後倍率：${calculateMultiplier(mineCount, revealed.size + 1).toFixed(4)}x`;
    sidebar.appendChild(nextMultiLine);

    payoutLine.textContent = `預期收益：${expectedPayout(currentMultiplier).toFixed(2)} 虛擬幣`; // 這行顯示若現在兌現可拿到多少。
    sidebar.appendChild(payoutLine); // 這行把收益段落加入側欄。

    const statusLine = document.createElement("p"); // 這行建立狀態訊息節點，回饋玩家操作結果。
    statusLine.textContent = lastStatus; // 這行顯示當前狀態，如已投注/踩雷/可兌現。
    sidebar.appendChild(statusLine); // 這行把狀態訊息插入側欄。

    const simulateBtn = document.createElement("button");
    simulateBtn.className = "ghost-btn";
    simulateBtn.textContent = "模擬 10,000 局";
    simulateBtn.addEventListener("click", () => {
      showSimulationOverlay();
    });
    sidebar.appendChild(simulateBtn);

    const betButton = document.createElement("button"); // 這行建立投注按鈕節點。
    betButton.className = "bet-btn"; // 這行套用投注按鈕樣式，使其醒目可點擊。
    betButton.textContent = `投注（${currentStake.toFixed(2)} 幣）`; // 這行呈現投注成本提示，避免使用者誤操作。
    betButton.disabled = activeRound || state.tokens < BET_COST_TOKEN || state.virtualCoins < currentStake; // 這行在對局中或資源不足時禁用按鈕。
    if (!activeRound && state.virtualCoins < currentStake) stakeWarning.classList.remove("hidden-lock");
    if (!activeRound && state.virtualCoins < currentStake) {
      stakeWarning.textContent = "餘額不足，無法開局";
      stakeWarning.classList.remove("hidden-lock");
    }
    if (activeRound) betButton.classList.add("active-round");
    betButton.addEventListener("click", startBet); // 這行綁定投注事件，點擊後固定炸彈分布並開局。
    sidebar.appendChild(betButton); // 這行把投注按鈕加入側欄。

    const cashOutButton = document.createElement("button"); // 這行建立兌現按鈕節點。
    cashOutButton.className = "cashout-btn"; // 這行套用兌現按鈕樣式，與投注按鈕區分功能。
    cashOutButton.textContent = "兌現 (Cash Out)"; // 這行設定按鈕文字，符合需求命名。
    cashOutButton.disabled = !activeRound || revealed.size === 0; // 這行確保至少翻到一顆寶石才可兌現。
    cashOutButton.addEventListener("click", cashOut); // 這行綁定兌現行為，點擊即結算本局。
    sidebar.appendChild(cashOutButton); // 這行把兌現按鈕放到側欄末端。

    const board = document.createElement("div"); // 這行建立棋盤容器節點，用來承載 25 個格子。
    board.className = "mines-board"; // 這行套用 5x5 Grid 樣式，形成固定掃雷盤面。
    layout.appendChild(board); // 這行把棋盤掛進 layout 右側。

    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const cell = document.createElement("button"); // 這行建立單一格子的 button 節點，支援鍵盤與滑鼠操作。
      cell.className = "mine-cell"; // 這行套用格子樣式，顯示深灰底與圓角設計。
      cell.dataset.index = String(i); // 這行把索引綁到 data 屬性，事件時可回查對應位置。
      cell.textContent = "◆"; // 這行先顯示未翻開符號，統一初始視覺狀態。
      const opened = revealed.has(i); // 這行判斷此格是否已被點開，供後續控制樣式與禁用狀態。
      if (opened) {
        cell.textContent = "💎"; // 這行把已開安全格換成寶石 icon，清楚表達成功翻牌。
        cell.classList.add("revealed-gem"); // 這行加入寶石特效 class，做發光與縮放視覺。
      }
      if (!activeRound && mines[i]) {
        cell.textContent = "💣"; // 這行在對局結束後揭示地雷 icon，讓玩家看到完整盤面。
        cell.classList.add("revealed-mine"); // 這行加入地雷特效 class，顯示紅色危險狀態。
      }
      cell.disabled = opened || !activeRound; // 這行鎖住已開格或非進行中狀態，避免無效重複點擊。
      cell.addEventListener("click", () => onCellClick(i)); // 這行綁定格子點擊事件，交由核心邏輯判定結果。
      board.appendChild(cell); // 這行把單一格子插入棋盤容器，逐格拼出完整 5x5。
    }

    if (!activeRound && mines.some(Boolean)) {
      revealAllCells(board);
    }

    gambleMount.appendChild(panel);
  }

  function forceBackToFocus() {
    stopTimer();
    stopPlinkoBurstSettleTimer();
    activeRound = false;
    mines = [];
    revealed = new Set();
    currentMultiplier = 1;
    plinko.active = false;
    plinko.animating = false;
    plinko.roundDeducted = false;
    plinko.burstRounds = [];
    plinko.burstSettledCount = 0;
    plinko.burstTotalStake = 0;
    plinko.burstProfitAccum = 0;
    resultScreen = null;
    hideResultOverlay();
    lastStatus = "請先投注開始本局。";
    state.mode = "focus";
    state.running = false;
    state.paused = false;
    state.tokens = 0;
    state.justFinishedFocus = false;
    state.totalSeconds = state.selectedMinutes * 60;
    state.remainingSeconds = state.totalSeconds;
    currentView = "focus";
    applyTheme();
    applyLayout();
    updateRing();
    updateLabels();
    renderMinesPanel();
    saveState();
  }

  function onCycleFinish() {
    playBell();
    notifyTimeUp(state.mode === "focus" ? "專注時間到！可前往遊戲選擇。" : "休息時間到！返回專注模式。");
    if (state.mode === "focus") {
      state.mode = "gamble";
      state.tokens += 1;
      state.justFinishedFocus = true;
      state.focusCompletedCount += 1;
      state.lastPredictedWinRate = buildPredictedWinRate();
      state.running = false;
      state.paused = false;
      activeRound = false;
      mines = [];
      revealed = new Set();
      currentMultiplier = 1;
      roundSource = "專注獎勵";
      lastStatus = "專注完成，請先投注再開始翻牌。";
      currentView = "selector";
      applyTheme();
      applyLayout();
      updateLabels();
      renderGameSelector();
      saveState();
      return;
    }
    if (state.mode === "break") {
      state.mode = "focus";
      state.running = false;
      state.paused = false;
      state.totalSeconds = state.selectedMinutes * 60;
      state.remainingSeconds = state.totalSeconds;
      currentView = "focus";
      applyTheme();
      applyLayout();
      updateRing();
      updateLabels();
      saveState();
    }
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startTimer() {
    if (state.running || state.mode === "gamble") return;
    state.running = true;
    state.paused = false;
    updateLabels();

    state.timerId = setInterval(() => {
      state.remainingSeconds -= 1; // 使用 setInterval 每秒扣 1 秒，驅動倒數與 UI 更新。
      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = 0;
        stopTimer();
        updateRing();
        updateLabels();
        onCycleFinish();
        return;
      }
      updateRing();
      updateLabels();
      saveState();
    }, 1000);
  }

  function pauseOrResumeTimer() {
    if (state.mode === "gamble") return;
    if (state.running) {
      stopTimer();
      state.running = false;
      state.paused = true;
      updateLabels();
      saveState();
      return;
    }
    if (state.paused) {
      startTimer();
      saveState();
    }
  }

  function setupControls() {
    minuteRange.addEventListener("input", () => {
      if (state.running || state.mode === "gamble" || state.paused) return;
      state.selectedMinutes = Number(minuteRange.value);
      state.totalSeconds = state.selectedMinutes * 60;
      state.remainingSeconds = state.totalSeconds;
      updateRing();
      updateLabels();
      saveState();
    });

    startBtn.addEventListener("click", () => {
      ensureAudio();
      requestNotificationPermission();
      if (state.mode === "gamble") return;
      if (!state.running && !state.paused) {
        if (state.mode === "focus") {
          state.totalSeconds = state.selectedMinutes * 60;
          state.remainingSeconds = state.totalSeconds;
        }
        if (state.mode === "break") {
          state.totalSeconds = BREAK_SECONDS;
          state.remainingSeconds = BREAK_SECONDS;
        }
        updateRing();
      }
      startTimer();
      saveState();
    });

    pauseBtn.addEventListener("click", pauseOrResumeTimer);
    resetBtn.addEventListener("click", forceBackToFocus);
    openStatsBtn.addEventListener("click", () => toggleStatsPage(true));
    openShopBtn.addEventListener("click", () => toggleShopPage(true));
    backFromStatsBtn.addEventListener("click", () => toggleStatsPage(false));
    backFromShopBtn.addEventListener("click", () => toggleShopPage(false));
    resetStatsBtn.addEventListener("click", () => {
      state.focusCompletedCount = 0;
      state.netVirtualCoins = 0;
      state.virtualCoins = NEW_USER_COINS;
      state.lastPredictedWinRate = null;
      state.gameHistory = [];
      saveState();
      updateLabels();
      renderStatsTable();
    });
    debugGameBtn.addEventListener("click", () => {
      stopTimer();
      requestNotificationPermission();
      state.mode = "gamble";
      state.running = false;
      state.paused = false;
      state.tokens = Math.max(2, state.tokens);
      state.justFinishedFocus = true;
      state.lastPredictedWinRate = buildPredictedWinRate();
      roundSource = "測試模式";
      currentView = "selector";
      applyTheme();
      applyLayout();
      updateLabels();
      renderGameSelector();
      saveState();
    });
  }

  function startIntegrityGuard() {
    setInterval(() => {
      if (showingStatsPage) return;
      const unauthorizedGamble = state.mode !== "gamble" || !state.justFinishedFocus;
      if (unauthorizedGamble && currentView !== "focus") {
        currentView = "focus";
        applyLayout();
        gambleMount.innerHTML = "";
      }
      if (state.mode === "gamble" && !state.justFinishedFocus) {
        forceBackToFocus();
      }
      if (state.mode === "gamble" && activeRound && mines.length !== BOARD_SIZE) {
        forceBackToFocus();
      }
    }, 300);
  }

  function init() {
    loadState();
    state.selectedMinutes = Math.max(1, Math.min(60, state.selectedMinutes));
    minuteRange.value = String(state.selectedMinutes);
    state.mode = "focus";
    state.running = false;
    state.paused = false;
    state.totalSeconds = state.selectedMinutes * 60;
    state.remainingSeconds = state.totalSeconds;
    setupControls();
    showWelcomeSplash();
    applyTheme();
    applyLayout();
    updateRing();
    updateLabels();
    toggleStatsPage(false);
    toggleShopPage(false);
    gambleMount.innerHTML = "";
    renderStatsTable();
    startIntegrityGuard();
    saveState();
  }

  init();
})();
