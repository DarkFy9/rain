document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('rainCanvas');
    const ctx = canvas.getContext('2d');
    const windowGlass = document.querySelector('.window-glass');
    const audio = document.getElementById('backgroundAudio');
    
    // Set canvas dimensions to match its container
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Settings object to store default and current values
    const settings = {
        // Default settings
        defaults: {
            windowOpacity: 0, // Changed to 0
            fogOpacity: 0.19,
            fogRegenRate: 0.0006,
            dropOpacity: 0.16,
            dropSpawnRate: 0.5,
            dropMaxCount: 50,
            dropSizeMin: 2,
            dropSizeMax: 6,
            baseSpeed: 0.05, // Halved from 0.1 to 0.05
            weightLossRate: 0.0005,
            massGainRate: 0.00015,
            musicVolume: 0.5,
            cellSize: 3, // Fog resolution (cell size)
            frameColor: "#5D4037", // Default frame color
            trailFadeSpeed: 0.1, // Speed at which stagnant trails fade (0-1)
            minActiveSize: 0.6 // Minimum size for a drop to remain active while falling
        },
        
        // Current settings (initially set to defaults)
        current: {}
    };
    
    // Initialize current settings with defaults
    Object.assign(settings.current, settings.defaults);
    
    // Audio control
    let isPlaying = false;
    let musicAutoStarted = false; // Flag to track if music was auto-started
    
    function initializeAudio() {
        const musicSelector = document.getElementById('musicSelector');
        const playPauseButton = document.getElementById('playPauseMusic');
        const volumeControl = document.getElementById('volumeControl');
        const playIcon = document.getElementById('playIcon');
        const pauseIcon = document.getElementById('pauseIcon');
        
        // Set initial source and volume
        audio.src = musicSelector.value;
        audio.volume = settings.current.musicVolume;
        volumeControl.value = settings.current.musicVolume;
        
        // Change music source when selection changes
        musicSelector.addEventListener('change', () => {
            const wasPlaying = !audio.paused;
            audio.src = musicSelector.value;
            
            if (wasPlaying) {
                audio.play().catch(error => {
                    console.error('Error playing audio:', error);
                });
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'inline';
                isPlaying = true;
            }
        });
        
        // Play/pause button functionality
        playPauseButton.addEventListener('click', () => {
            if (isPlaying) {
                audio.pause();
                playIcon.style.display = 'inline';
                pauseIcon.style.display = 'none';
            } else {
                audio.play().catch(error => {
                    console.error('Error playing audio:', error);
                });
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'inline';
            }
            isPlaying = !isPlaying;
        });
        
        // Volume control
        volumeControl.addEventListener('input', () => {
            const volume = parseFloat(volumeControl.value);
            audio.volume = volume;
            settings.current.musicVolume = volume;
        });
    }
    
    // Rain system reference
    let rainSystem;
    
    // Initialize the window glass opacity
    function updateWindowOpacity() {
        const opacity = settings.current.windowOpacity;
        canvas.style.backgroundColor = `rgba(200, 220, 240, ${opacity})`;
    }
    
    // Create fog map - tracks where fog has been cleared
    const fogMap = {
        cells: [],
        
        init: function() {
            // Use cellSize from current settings
            const cellSize = settings.current.cellSize;
            const cols = Math.ceil(canvas.width / cellSize);
            const rows = Math.ceil(canvas.height / cellSize);
            
            // Initialize all fog cells to full opacity (1.0)
            this.cells = new Array(rows);
            for (let y = 0; y < rows; y++) {
                this.cells[y] = new Array(cols).fill(1.0);
            }
        },
        
        // Clear fog at a specific position (reduce opacity)
        clearAt: function(x, y, radius, amount) {
            const cellSize = settings.current.cellSize;
            const col = Math.floor(x / cellSize);
            const row = Math.floor(y / cellSize);
            const radiusCells = Math.ceil(radius / cellSize);
            
            // Affect a circular area around the position
            for (let r = -radiusCells; r <= radiusCells; r++) {
                for (let c = -radiusCells; c <= radiusCells; c++) {
                    const currentRow = row + r;
                    const currentCol = col + c;
                    
                    // Skip if outside the canvas
                    if (currentRow < 0 || currentRow >= this.cells.length || 
                        currentCol < 0 || currentCol >= this.cells[0].length) {
                        continue;
                    }
                    
                    // Calculate distance from center (for circular effect)
                    const distance = Math.sqrt(r*r + c*c);
                    if (distance <= radiusCells) {
                        // Reduce opacity more at center, less at edges
                        const reduction = amount * (1 - distance / radiusCells);
                        this.cells[currentRow][currentCol] = Math.max(0, this.cells[currentRow][currentCol] - reduction);
                    }
                }
            }
        },
        
        // Get fog density at a specific position
        getDensityAt: function(x, y) {
            const cellSize = settings.current.cellSize;
            const col = Math.floor(x / cellSize);
            const row = Math.floor(y / cellSize);
            
            // Return 0 if outside boundaries
            if (row < 0 || row >= this.cells.length || 
                col < 0 || col >= this.cells[0].length) {
                return 0;
            }
            
            return this.cells[row][col];
        },
        
        // Gradually regenerate all fog
        regenerate: function() {
            // Use the current regeneration rate from settings
            const rate = settings.current.fogRegenRate;
            
            for (let y = 0; y < this.cells.length; y++) {
                for (let x = 0; x < this.cells[y].length; x++) {
                    if (this.cells[y][x] < 1.0) {
                        this.cells[y][x] = Math.min(1.0, this.cells[y][x] + rate);
                    }
                }
            }
        },
        
        // Draw the fog layer with smoothing effect
        draw: function(ctx) {
            const cellSize = settings.current.cellSize;
            
            // First clear the canvas to be fully transparent
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Create an offscreen canvas for smoothing
            const offCanvas = document.createElement('canvas');
            offCanvas.width = canvas.width;
            offCanvas.height = canvas.height;
            const offCtx = offCanvas.getContext('2d');
            
            // Draw raw fog cells to offscreen canvas
            for (let y = 0; y < this.cells.length; y++) {
                for (let x = 0; x < this.cells[y].length; x++) {
                    const opacity = this.cells[y][x];
                    if (opacity > 0) {
                        // Use the current fog opacity from settings
                        offCtx.fillStyle = `rgba(200, 220, 240, ${settings.current.fogOpacity * opacity})`;
                        offCtx.fillRect(
                            x * cellSize, 
                            y * cellSize, 
                            cellSize, 
                            cellSize
                        );
                    }
                }
            }
            
            // Apply a slight blur for smoothing
            ctx.filter = 'blur(2px)';
            ctx.drawImage(offCanvas, 0, 0);
            ctx.filter = 'none';
        },
        
        // Add fog to a specific position
        addFog: function(x, y, radius, amount) {
            const cellSize = settings.current.cellSize;
            const col = Math.floor(x / cellSize);
            const row = Math.floor(y / cellSize);
            const radiusCells = Math.ceil(radius / cellSize);
            
            // Affect a circular area around the position
            for (let r = -radiusCells; r <= radiusCells; r++) {
                for (let c = -radiusCells; c <= radiusCells; c++) {
                    const currentRow = row + r;
                    const currentCol = col + c;
                    
                    // Skip if outside the canvas
                    if (currentRow < 0 || currentRow >= this.cells.length || 
                        currentCol < 0 || currentCol >= this.cells[0].length) {
                        continue;
                    }
                    
                    // Calculate distance from center (for circular effect)
                    const distance = Math.sqrt(r*r + c*c);
                    if (distance <= radiusCells) {
                        // Reduce opacity more at center, less at edges
                        const reduction = amount * (1 - distance / radiusCells);
                        this.cells[currentRow][currentCol] = Math.min(1.0, this.cells[currentRow][currentCol] + reduction);
                    }
                }
            }
        }
    };
    
    // Raindrop class
    class Raindrop {
        constructor(x, y, size = null) {
            this.x = x;
            this.y = y;
            
            // Use settings for size if not provided
            if (size === null) {
                const minSize = settings.current.dropSizeMin;
                const maxSize = settings.current.dropSizeMax;
                this.size = minSize + Math.random() * (maxSize - minSize);
            } else {
                this.size = size;
            }
            
            this.mass = Math.PI * this.size * this.size; // Mass proportional to area
            this.baseSpeed = settings.current.baseSpeed * (1 + Math.random() * 0.2);
            this.speed = this.baseSpeed;
            this.maxSpeed = 2 + this.size * 0.5;
            // Add x momentum (sideways movement)
            this.xMomentum = (Math.random() * 2 - 1) * 0.2; // Small random initial sideways momentum
            this.momentumDecay = 0.0005; // How quickly momentum decays
            this.momentumThreshold = 0.25; // Reduced threshold to prevent cyclic stopping/starting
            this.trail = []; // Store previous positions for trail effect
            this.maxTrailLength = 10 + this.size * 5;
            this.opacity = settings.current.dropOpacity + Math.random() * 0.3;
            this.active = true;
            this.moving = true; // Whether the drop is moving or stopped
            this.stuckTime = 0;
            this.stuckDuration = Math.random() * 80 + 20;
            this.canBeStuck = Math.random() > 0.7; // Make fewer drops able to get stuck
            // Track weight loss - base rate plus factor proportional to size
            this.baseLossRate = settings.current.weightLossRate + Math.random() * 0.01;
            this.minSize = settings.current.minActiveSize; // Minimum size before drop stops
            this.lastMomentumUpdate = 0;
            this.momentumUpdateInterval = Math.floor(Math.random() * 30) + 20; // Random intervals for momentum changes
            this.sizeMoveThreshold = 3.5; // Size threshold for large drops to start moving
            this.stoppedTime = 0; // Track how long a drop has been stopped
            this.massGainRate = settings.current.massGainRate; // Rate at which drops gain mass from fog
            this.reachedBoundary = false; // Flag to indicate if drop has reached the boundary
            this.isFading = false; // Flag to indicate if drop is in fading phase
        }
        
        update() {
            if (!this.active) return;
            
            // Check if drop is now too small to remain active while falling
            if (this.moving && this.size < this.minSize && !this.isFading) {
                this.isFading = true;
                this.moving = false;
                this.opacity = settings.current.fogOpacity; // Set opacity to fog opacity
                return;
            }
            
            // Handle fading drops (either too small or reached boundary)
            if (this.isFading) {
                // Fade trail faster
                if (this.trail.length > 0 && Math.random() < settings.current.trailFadeSpeed * 3) {
                    const lostTrail = this.trail.pop();
                    fogMap.addFog(lostTrail.x, lostTrail.y, this.size, 0.02);
                } else if (this.trail.length === 0) {
                    this.active = false; // Deactivate once trail is gone
                }
                return;
            }
            
            // // Give initial velocity to drops at the top of the screen
            // if (this.y < 5 && !this.moving) {
            //     this.moving = true;
            //     this.speed = this.baseSpeed;
            // }
            
            // Check if the drop is already stuck in place
            if (this.stuckTime > 0) {
                this.stuckTime--;
                if (this.stuckTime === 0) {
                    // When unstuck, sometimes grow in size (simulating accumulation)
                    if (Math.random() > 0.7) {
                        this.size += 0.5 + Math.random();
                        this.mass = Math.PI * this.size * this.size;
                        this.maxSpeed = 2 + this.size * 0.5;
                        this.moving = true; // Start moving again
                        //this.stoppedTime = 0;
                    }
                }
                
                // When stuck, slowly dissipate trails into fog
                if (this.trail.length > 0 && Math.random() < settings.current.trailFadeSpeed * 2) {
                    const lostTrail = this.trail.pop();
                    // Add to fog where the trail disappeared
                    fogMap.addFog(lostTrail.x, lostTrail.y, this.size * 0.5, 0.01);
                }
                
                return;
            }
            
            // Handle stopped drops
            if (!this.moving) {
                //this.stoppedTime++;
                
                // Check if drop has grown past the size threshold to start moving
                if (this.size > this.sizeMoveThreshold) {
                    // Calculate how much over the threshold the drop is
                    const sizeOverThreshold = this.size - this.sizeMoveThreshold;
                    // Chance increases with size (up to 30% chance per update)
                    const moveChance = Math.min(0.3, 0.02 * sizeOverThreshold);
                    
                    if (Math.random() < moveChance) {
                        // Start moving with a burst of speed
                        this.moving = true;
                        this.speed = this.baseSpeed + (sizeOverThreshold * 0.1);
                        // Add a bit of random momentum
                        this.xMomentum = (Math.random() * 2 - 1) * 0.3;
                    }
                }
                
                // Slowly dissipate trails from non-moving drops into fog
                if (this.trail.length > 0 && Math.random() < settings.current.trailFadeSpeed) {
                    const lostTrail = this.trail.pop();
                    // Add to fog where the trail disappeared
                    fogMap.addFog(lostTrail.x, lostTrail.y, this.size * 0.5, 0.01);
                }
                
                return;
            }
            
            // Check if drop has lost too much mass or momentum to continue moving
            if (this.moving && 
                (Math.abs(this.speed) < this.momentumThreshold)) {
                this.moving = false;
                //this.stoppedTime = 0;
                this.speed = 0;
                return;
            }
            
            // Add current position to trail
            this.trail.unshift({x: this.x, y: this.y});
            
            // Limit trail length and add to fog when trails disappear
            if (this.trail.length > this.maxTrailLength) {
                const lostTrail = this.trail.pop();
                // Add a small amount of fog where the trail disappeared
                fogMap.addFog(lostTrail.x, lostTrail.y, this.size, 0.02);
            }
            
            // Lose size/weight as it moves (leaving water behind) - proportional to size
            const weightLossRate = this.baseLossRate * this.size;
            const previousSize = this.size;
            this.size = Math.max(0.1, this.size - weightLossRate);
            
            // Lose speed proportional to mass loss
            if (previousSize > this.size) {
                const sizeLossRatio = (previousSize - this.size) / previousSize;
                this.speed *= (1 - sizeLossRatio * 0.3); // Reduce speed by up to 30% of the proportional mass loss
            }
            
            // Gain mass from fog (if moving through foggy areas)
            const fogDensity = fogMap.getDensityAt(this.x, this.y);
            if (fogDensity > 0) {
                const massGain = this.massGainRate * fogDensity;
                this.size += massGain;
            }
            
            // Update mass based on new size
            this.mass = Math.PI * this.size * this.size;
            
            // Clear fog where the drop moves (increased hitbox: drop size * 1.5 + 2 pixels)
            fogMap.clearAt(this.x, this.y, this.size * 1.5 + 2, 0.2);
            
            // Update momentum at random intervals
            this.lastMomentumUpdate++;
            if (this.lastMomentumUpdate >= this.momentumUpdateInterval) {
                // Small random change to x momentum
                this.xMomentum += (Math.random() * 2 - 1) * 0.08;
                // Dampen extreme momentum values
                if (Math.abs(this.xMomentum) > 0.5) {
                    this.xMomentum *= 0.8;
                }
                this.lastMomentumUpdate = 0;
                this.momentumUpdateInterval = Math.floor(Math.random() * 30) + 20;
            }
            
            // Slower acceleration due to gravity, affected by mass
            this.speed = Math.min(this.speed * (1 + (0.004 * this.mass / 10)), this.maxSpeed);
            
            // Decay x momentum gradually
            this.xMomentum *= (1 - this.momentumDecay);
            
            // Move raindrop
            if (this.moving) {
                this.y += this.speed;
                this.x += this.xMomentum;
            }
            
            // Higher chance to get stuck when small
            if (this.canBeStuck && Math.random() < 0.01 * (1.5 - this.size/5)) {
                this.stuckTime = this.stuckDuration;
                this.speed = this.baseSpeed; // Reset speed when unstuck
            }
        }
        
        draw(ctx) {
            if (!this.active) return;
            
            // Draw trail
            if (this.trail.length > 1) {
                ctx.beginPath();
                
                // Draw trail with gradient opacity and decreasing width
                for (let i = 0; i < this.trail.length - 1; i++) {
                    const point = this.trail[i];
                    const nextPoint = this.trail[i + 1];
                    const trailOpacity = this.opacity * (1 - i / this.trail.length) * 0.7;
                    const width = Math.max(0.1, this.size * (1 - i / this.trail.length) * 0.8);
                    
                    ctx.strokeStyle = `rgba(220, 240, 255, ${trailOpacity})`;
                    ctx.lineWidth = width;
                    
                    ctx.beginPath();
                    ctx.moveTo(point.x, point.y);
                    ctx.lineTo(nextPoint.x, nextPoint.y);
                    ctx.stroke();
                }
            }
            
            // Draw raindrop head
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(220, 240, 255, ${this.opacity})`;
            ctx.fill();
        }
        
        // Check collision with another raindrop
        checkCollision(otherDrop) {
            if (!this.active || !otherDrop.active) return false;
            
            const dx = this.x - otherDrop.x;
            const dy = this.y - otherDrop.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If drops are close enough, they collide
            return distance < (this.size + otherDrop.size);
        }
        
        // Merge with another raindrop
        merge(otherDrop) {
            // Calculate total mass
            const totalMass = this.mass + otherDrop.mass;
            
            // New size based on combined mass (proportional to area)
            const newSize = Math.sqrt(totalMass / Math.PI);
            
            // Calculate center of mass
            const centerX = (this.x * this.mass + otherDrop.x * otherDrop.mass) / totalMass;
            const centerY = (this.y * this.mass + otherDrop.y * otherDrop.mass) / totalMass;
            
            // Update position to center of mass
            this.x = centerX;
            this.y = centerY;
            
            // Update size and mass
            this.size = newSize;
            this.mass = totalMass;
            
            // Combine momentum (weighted average)
            this.speed = (this.speed * this.mass + otherDrop.speed * otherDrop.mass) / totalMass;
            this.xMomentum = (this.xMomentum * this.mass + otherDrop.xMomentum * otherDrop.mass) / totalMass;
            
            // Update other properties
            this.maxSpeed = 2 + this.size * 0.5;
            this.maxTrailLength = 10 + this.size * 5;
            
            // Ensure the drop is moving after a merger
            this.moving = true;
            //this.stoppedTime = 0;
            
            // Deactivate the other drop
            otherDrop.active = false;
        }
    }
    
    // Rain system
    class RainSystem {
        constructor() {
            this.raindrops = [];
            this.lastFrameTime = 0;
            this.frameInterval = 1000 / 60; // Target 60 FPS
            this.isRunning = true;
        }
        
        update() {
            // Regenerate fog
            fogMap.regenerate();
            
            // Spawn new raindrops (less frequently)
            if (this.raindrops.filter(drop => drop.active).length < settings.current.dropMaxCount) {
                // Only spawn drops occasionally
                if (Math.random() < 0.3) {
                    for (let i = 0; i < settings.current.dropSpawnRate; i++) {
                        // Always spawn from top, random x position
                        const x = Math.random() * canvas.width;
                        const y = 0; // Start from top
                        const drop = new Raindrop(x, y);
                        // Ensure new drops start with some downward momentum
                        drop.speed = drop.baseSpeed * (1 + Math.random() * 0.5);
                        this.raindrops.push(drop);
                    }
                }
            }
            
            // Update raindrops
            for (let i = 0; i < this.raindrops.length; i++) {
                const drop = this.raindrops[i];
                if (drop.active) {
                    drop.update();
                    
                    // Check if drop hit bottom of screen or sides
                    if (drop.y > canvas.height || drop.x < 0 || drop.x > canvas.width) {
                        // Instead of immediately deactivating, start the fading process
                        if (!drop.reachedBoundary) {
                            drop.reachedBoundary = true;
                            drop.isFading = true;
                            drop.moving = false;
                            drop.speed = 0;
                            drop.xMomentum = 0;
                            drop.opacity = settings.current.fogOpacity; // Set opacity to fog opacity
                        }
                    }
                    
                    // Check collisions with other drops
                    for (let j = i + 1; j < this.raindrops.length; j++) {
                        const otherDrop = this.raindrops[j];
                        if (drop.active && otherDrop.active && drop.checkCollision(otherDrop)) {
                            // Always merge into the larger drop
                            if (drop.mass >= otherDrop.mass) {
                                drop.merge(otherDrop);
                            } else {
                                otherDrop.merge(drop);
                            }
                        }
                    }
                }
            }
            
            // Remove inactive drops
            this.raindrops = this.raindrops.filter(drop => drop.active);
        }
        
        draw() {
            // Draw the fog layer
            fogMap.draw(ctx);
            
            // Draw raindrops
            for (const drop of this.raindrops) {
                if (drop.active) {
                    drop.draw(ctx);
                }
            }
        }
        
        animate(currentTime) {
            if (!this.isRunning) return;
            
            window.requestAnimationFrame(time => this.animate(time));
            
            // Skip frames if necessary to maintain frame rate
            const elapsed = currentTime - this.lastFrameTime;
            if (elapsed < this.frameInterval) return;
            
            this.lastFrameTime = currentTime;
            
            this.update();
            this.draw();
        }
        
        start() {
            // Initialize fog map
            fogMap.init();
            this.isRunning = true;
            this.animate(0);
        }
        
        stop() {
            this.isRunning = false;
        }
        
        reset() {
            this.raindrops = [];
            fogMap.init();
        }
    }
    
    // Function to start the simulation
    function startSimulation() {
        // Stop existing simulation if it exists
        if (rainSystem) {
            rainSystem.stop();
        }
        
        // Update window opacity
        updateWindowOpacity();
        
        // Create and start a new rain system
        rainSystem = new RainSystem();
        rainSystem.start();
    }
    
    // Function to update window frame color
    function updateFrameColor(color) {
        const windowFrame = document.querySelector('.window-frame');
        if (windowFrame) {
            windowFrame.style.backgroundColor = color;
            windowFrame.style.borderColor = color;
            settings.current.frameColor = color;
        }
    }
    
    // Settings panel functionality
    function initializeSettingsPanel() {
        const panel = document.querySelector('.settings-panel');
        const toggle = document.getElementById('settingsToggle');
        const resetButton = document.getElementById('resetSettings');
        const refreshButton = document.getElementById('refreshSimulation');
        const saveButton = document.getElementById('saveSettings');
        
        // Toggle settings panel
        toggle.addEventListener('click', () => {
            panel.classList.toggle('open');
        });
        
        // Initialize all sliders with current values
        const sliders = document.querySelectorAll('.setting input[type="range"]');
        
        sliders.forEach(slider => {
            const valueDisplay = slider.nextElementSibling;
            const settingName = slider.id;
            
            // Set initial value from settings
            slider.value = settings.current[settingName];
            valueDisplay.textContent = settings.current[settingName];
            
            // Update value display and setting when slider changes
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                valueDisplay.textContent = value.toFixed(4); // Show more decimal places for precision
                settings.current[settingName] = value;
                
                // Update window opacity immediately if that's what changed
                if (settingName === 'windowOpacity') {
                    updateWindowOpacity();
                }
                
                // Restart the simulation with new cell size if that's what changed
                if (settingName === 'cellSize') {
                    startSimulation();
                }
            });
        });
        
        // Initialize frame color swatches
        const colorSwatches = document.querySelectorAll('.color-swatch');
        
        // Mark the active color
        for (const swatch of colorSwatches) {
            if (swatch.dataset.color === settings.current.frameColor) {
                swatch.classList.add('active');
            }
            
            swatch.addEventListener('click', () => {
                // Remove active class from all swatches
                colorSwatches.forEach(s => s.classList.remove('active'));
                // Add active class to clicked swatch
                swatch.classList.add('active');
                // Update frame color
                updateFrameColor(swatch.dataset.color);
            });
        }
        
        // Initialize the frame color
        updateFrameColor(settings.current.frameColor);
        
        // Reset button resets all settings to defaults
        resetButton.addEventListener('click', () => {
            Object.assign(settings.current, settings.defaults);
            
            // Update all sliders with default values
            sliders.forEach(slider => {
                const valueDisplay = slider.nextElementSibling;
                const settingName = slider.id;
                
                slider.value = settings.current[settingName];
                valueDisplay.textContent = settings.current[settingName].toFixed(4);
            });
            
            // Update window opacity
            updateWindowOpacity();
            
            // Update frame color
            updateFrameColor(settings.current.frameColor);
            
            // Update color swatch selection
            colorSwatches.forEach(swatch => {
                swatch.classList.toggle('active', swatch.dataset.color === settings.current.frameColor);
            });
            
            // Update volume
            if (audio) {
                audio.volume = settings.current.musicVolume;
                document.getElementById('volumeControl').value = settings.current.musicVolume;
            }
            
            // Restart simulation with new settings
            startSimulation();
        });
        
        // Refresh button restarts the simulation with current settings
        refreshButton.addEventListener('click', () => {
            startSimulation();
        });
        
        // Save button exports settings as a text file
        saveButton.addEventListener('click', () => {
            // Create a text representation of the settings
            const settingsText = JSON.stringify(settings.current, null, 2);
            
            // Create a blob and download link
            const blob = new Blob([settingsText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            // Create a temporary download link
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = 'rainy-window-settings.txt';
            
            // Trigger download and clean up
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);
        });
    }
    
    // Initialize settings panel and audio
    initializeSettingsPanel();
    initializeAudio();
    
    // Start the simulation
    startSimulation();
    
    // Auto-play the first song if possible
    audio.play().then(() => {
        isPlaying = true;
        musicAutoStarted = true;
        document.getElementById('playIcon').style.display = 'none';
        document.getElementById('pauseIcon').style.display = 'inline';
    }).catch(error => {
        console.log('Auto-play prevented by browser. Click play to start music.');
        // Try to work around autoplay restrictions when user interacts with the page
        window.addEventListener('click', function autoStartMusic() {
            if (!musicAutoStarted) {
                audio.play().then(() => {
                    isPlaying = true;
                    musicAutoStarted = true;
                    document.getElementById('playIcon').style.display = 'none';
                    document.getElementById('pauseIcon').style.display = 'inline';
                    window.removeEventListener('click', autoStartMusic);
                }).catch(e => {
                    console.error('Still could not auto-play music after user interaction');
                });
            }
        });
    });
    
    // Add click effect to create new raindrops
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Add several drops in a small area
        for (let i = 0; i < 5; i++) { // Fewer drops on click
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = (Math.random() - 0.5) * 20;
            const size = 3 + Math.random() * 5; // Bigger drops on click
            rainSystem.raindrops.push(new Raindrop(x + offsetX, y + offsetY, size));
        }
        
        // Clear fog around click point
        fogMap.clearAt(x, y, 30, 0.8);
    });
}); 