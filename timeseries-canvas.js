(() => {
    const canvas = document.getElementById('timeseries-canvas');
    const ctx = canvas.getContext('2d');
    let w, h;

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }

    // Live Regression — Scatter plot with dynamic fit line
    let regPoints = [];
    let regTargetLine = { slope: 0, intercept: 0, r: 0, r2: 0 };
    let fixedLine = { slope: 0, intercept: 0, r: 0, r2: 0 };
    let currentCycleSlope = -0.3;
    let currentCycleCenterY = 0;
    const CYCLE_DURATION = 4500; // Complete cycle duration in ms (4.5 seconds)
    let cycleStartTime = 0;
    let lastSpawnTime = 0;
    let lastTimestamp = 0;

    function generateDataSet() {
        regPoints = [];
        // Vary trend slope between positive and negative (-0.65 to +0.65)
        currentCycleSlope = (Math.random() - 0.5) * 1.3;
        currentCycleCenterY = h * (0.35 + Math.random() * 0.3);

        for (let i = 0; i < 45; i++) {
            addRegressionPoint();
        }
    }

    function initRegression(timestamp = performance.now()) {
        cycleStartTime = timestamp;
        lastSpawnTime = timestamp;
        generateDataSet();
        calcRegression();
        fixedLine.slope = regTargetLine.slope;
        fixedLine.intercept = regTargetLine.intercept;
        fixedLine.r = regTargetLine.r;
        fixedLine.r2 = regTargetLine.r2;
    }

    function addRegressionPoint() {
        // X position spanning across most of the viewport
        const x = Math.random() * w * 0.9 + w * 0.05;

        // Generate wide Gaussian noise (Box-Muller transform)
        const u1 = Math.random();
        const u2 = Math.random();
        const gaussianNoise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

        // 15% probability of being an outlier
        const isOutlier = Math.random() < 0.15;
        // Wider vertical noise scale for broader point dispersion
        const noiseScale = isOutlier ? (h * 0.25 + Math.random() * h * 0.15) : (h * 0.15 + Math.random() * h * 0.06);
        const noise = gaussianNoise * noiseScale;

        const y = currentCycleCenterY + currentCycleSlope * (x - w / 2) + noise;

        regPoints.push({
            x, y,
            opacity: 0,
            targetOpacity: isOutlier ? (0.06 + Math.random() * 0.096) : (0.096 + Math.random() * 0.192),
            size: isOutlier ? (1.2 + Math.random() * 1.5) : (1.6 + Math.random() * 2.4),
        });
    }

    function calcRegression() {
        if (regPoints.length < 2) return;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
        const n = regPoints.length;
        regPoints.forEach(p => {
            sumX += p.x;
            sumY += p.y;
            sumXY += p.x * p.y;
            sumX2 += p.x * p.x;
            sumY2 += p.y * p.y;
        });
        regTargetLine.slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        regTargetLine.intercept = (sumY - regTargetLine.slope * sumX) / n;

        // Pearson correlation coefficient (r) and R-squared (R²)
        const num = n * sumXY - sumX * sumY;
        const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        regTargetLine.r = den !== 0 ? -(num / den) : 0;
        regTargetLine.r2 = Math.pow(regTargetLine.r, 2);
    }

    function drawRegression(timestamp) {
        ctx.clearRect(0, 0, w, h);

        if (!lastTimestamp) lastTimestamp = timestamp;
        const dt = Math.min(timestamp - lastTimestamp, 100);
        lastTimestamp = timestamp;

        if (!cycleStartTime) cycleStartTime = timestamp;

        // Spawn a new background point every ~383 ms
        if (timestamp - lastSpawnTime > 383) {
            addRegressionPoint();
            if (regPoints.length > 75) regPoints.shift();
            lastSpawnTime = timestamp;
        }

        const cycleTime = (timestamp - cycleStartTime) % CYCLE_DURATION;
        const prevCycleTime = ((timestamp - dt) - cycleStartTime) % CYCLE_DURATION;

        // At cycle start, generate a new trend, calculate metrics, and freeze line
        if (cycleTime < prevCycleTime || prevCycleTime < 0) {
            generateDataSet();
            calcRegression();
            fixedLine.slope = regTargetLine.slope;
            fixedLine.intercept = regTargetLine.intercept;
            fixedLine.r = regTargetLine.r;
            fixedLine.r2 = regTargetLine.r2;
        }

        // ----------------------------------------------------
        // CYCLE PHASES (Target ~4.5s total cycle, Time-based in ms):
        // 1. Points Fade In: 0 to 591 ms (~0.59s)
        // 2. Points Only Delay: 591 to 1301 ms (~0.71s)
        // 3. Regression Line Fade In: 1301 to 1893 ms (~0.59s)
        // 4. Hold Together: 1893 to 3850 ms (~1.96s)
        // 5. Fade Out Together: 3850 to 4500 ms (~0.65s)
        // ----------------------------------------------------

        // Scatter points opacity factor
        let pointAlphaFactor = 0;
        if (cycleTime < 591) {
            pointAlphaFactor = cycleTime / 591;
        } else if (cycleTime < 3850) {
            pointAlphaFactor = 1;
        } else {
            pointAlphaFactor = (CYCLE_DURATION - cycleTime) / 650;
        }

        // Regression line opacity (starts after delay at 1301 ms)
        const maxLineOpacity = 0.28;
        let lineOpacity = 0;

        if (cycleTime < 1301) {
            lineOpacity = 0;
        } else if (cycleTime < 1893) {
            lineOpacity = ((cycleTime - 1301) / 592) * maxLineOpacity;
        } else if (cycleTime < 3850) {
            lineOpacity = maxLineOpacity;
        } else {
            lineOpacity = ((CYCLE_DURATION - cycleTime) / 650) * maxLineOpacity;
        }

        // Render scatter plot points (fade in first, frame-rate independent lerp)
        const lerpFactor = 1 - Math.exp(-dt * 0.008);
        regPoints.forEach(p => {
            p.opacity += (p.targetOpacity - p.opacity) * lerpFactor;
            const finalOpacity = p.opacity * pointAlphaFactor;
            if (finalOpacity > 0.003) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(160, 160, 255, ${finalOpacity})`;
                ctx.fill();
            }
        });

        // Render regression fit line (soft lilac accent)
        if (lineOpacity > 0.005) {
            const x0 = 0;
            const x1 = w;
            const y0 = fixedLine.slope * x0 + fixedLine.intercept;
            const y1 = fixedLine.slope * x1 + fixedLine.intercept;

            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.strokeStyle = `rgba(160, 160, 255, ${lineOpacity})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Regression metrics label (r and R²) aligned on right edge in crisp white
            const rSign = fixedLine.r >= 0 ? '+' : '';
            const labelText = `r = ${rSign}${fixedLine.r.toFixed(2)}  R² = ${fixedLine.r2.toFixed(2)}`;
            const textAlpha = (lineOpacity / maxLineOpacity) * 0.55;

            ctx.font = '11px "JetBrains Mono", monospace';
            ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;

            const textX = w - 165;
            const textY = Math.max(30, Math.min(h - 30, y1 - 8));

            ctx.fillText(labelText, textX, textY);
        }

        requestAnimationFrame(drawRegression);
    }

    // INIT
    resize();
    window.addEventListener('resize', () => {
        resize();
        if (regPoints.length) initRegression();
    });

    initRegression();
    requestAnimationFrame(drawRegression);

})();
