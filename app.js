(() => {
    const BASE_BREAK_SECONDS = 300; // 5分鐘
    const CIRCLE_RADIUS = 130;
    const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS;

    let state = {
        mode: 'focus', 
        running: false,
        remainingSeconds: 25 * 60,
        totalSeconds: 25 * 60,
        currentMultiplier: 1.0,
        selectedFocusMinutes: 25
    };

    // 選取 DOM
    const timeText = document.getElementById('timeText');
    const progressBar = document.getElementById('progress-bar');
    const statusBadge = document.getElementById('status-badge');
    const modeLabel = document.getElementById('modeLabel');
    const focusSlider = document.getElementById('focus-slider');
    const focusVal = document.getElementById('focus-val');
    const startBtn = document.getElementById('start-btn');
    const timerPanel = document.getElementById('timerPanel');
    const gambleZone = document.getElementById('gamble-zone');
    const currentMultText = document.getElementById('current-multiplier');
    const predictedBreakText = document.getElementById('predicted-break');
    const cashoutBtn = document.getElementById('cashout-btn');
    const gameMount = document.getElementById('game-mount');
    const gameHint = document.getElementById('game-hint');

    if(progressBar) {
        progressBar.style.strokeDasharray = CIRCLE_LENGTH;
        progressBar.style.strokeDashoffset = CIRCLE_LENGTH;
    }

    function updateTimerUI() {
        const m = Math.floor(state.remainingSeconds / 60);
        const s = state.remainingSeconds % 60;
        timeText.innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        
        const offset = CIRCLE_LENGTH - (state.remainingSeconds / state.totalSeconds) * CIRCLE_LENGTH;
        progressBar.style.strokeDashoffset = offset;
    }

    focusSlider.addEventListener('input', (e) => {
        state.selectedFocusMinutes = parseInt(e.target.value);
        focusVal.innerText = state.selectedFocusMinutes;
        state.totalSeconds = state.selectedFocusMinutes * 60;
        state.remainingSeconds = state.totalSeconds;
        updateTimerUI();
    });

    startBtn.addEventListener('click', () => {
        if (state.running) return;
        state.running = true;
        startBtn.disabled = true;
        focusSlider.disabled = true;
        
        const timer = setInterval(() => {
            state.remainingSeconds--;
            updateTimerUI();
            if (state.remainingSeconds <= 0) {
                clearInterval(timer);
                state.running = false;
                enterGamblePhase();
            }
        }, 1000);
    });

    function enterGamblePhase() {
        state.mode = 'gamble';
        document.body.classList.add('mode-gamble');
        timerPanel.classList.add('hidden-lock');
        gambleZone.classList.remove('hidden-lock');
        statusBadge.innerText = '命運博弈中...';
        state.currentMultiplier = 1.0;
        updateGambleUI();
    }

    function updateGambleUI() {
        currentMultText.innerText = state.currentMultiplier.toFixed(2);
        const totalSec = BASE_BREAK_SECONDS * state.currentMultiplier;
        const m = Math.floor(totalSec / 60);
        const s = Math.floor(totalSec % 60);
        predictedBreakText.innerText = `${m}:${String(s).padStart(2, '0')}`;
    }

    // 遊戲按鈕邏輯
    document.getElementById('playMinesBtn').addEventListener('click', () => {
        gameHint.innerHTML = "💣 掃雷模式：避開地雷以增加休息時間！";
        state.currentMultiplier = (Math.random() * 3 + 0.1).toFixed(2); 
        updateGambleUI();
        cashoutBtn.classList.remove('hidden-lock');
    });

    document.getElementById('playPlinkoBtn').addEventListener('click', () => {
        gameHint.innerHTML = "🔴 Plinko 模式：球正在落下...";
        state.currentMultiplier = (Math.random() * 5 + 0.2).toFixed(2);
        updateGambleUI();
        cashoutBtn.classList.remove('hidden-lock');
    });

    cashoutBtn.addEventListener('click', () => {
        const finalSeconds = Math.max(10, Math.floor(BASE_BREAK_SECONDS * state.currentMultiplier));
        startBreakPhase(finalSeconds);
    });

    function startBreakPhase(seconds) {
        state.mode = 'break';
        document.body.className = 'theme-break';
        gambleZone.classList.add('hidden-lock');
        timerPanel.classList.remove('hidden-lock');
        document.getElementById('controls').classList.add('hidden-lock');
        
        state.totalSeconds = seconds;
        state.remainingSeconds = seconds;
        modeLabel.innerText = '休息模式';
        statusBadge.innerText = '正在享受戰利品...';

        const timer = setInterval(() => {
            state.remainingSeconds--;
            updateTimerUI();
            if (state.remainingSeconds <= 0) {
                clearInterval(timer);
                alert('休息結束，準備進入下一個專注週期！');
                location.reload(); 
            }
        }, 1000);
    }
})();
