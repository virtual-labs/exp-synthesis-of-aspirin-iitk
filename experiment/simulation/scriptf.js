class AspirinSynthesisSim {
    constructor() {
        this.initElements();
        this.initState();
        this.initCanvas();
        this.setupEventListeners();
        this.createInfoPanel();
        this.updateUI();
    }

    initElements() {
        this.canvas = document.getElementById('labCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = document.getElementById('tooltip');
        this.instructionItems = document.querySelectorAll('#instructions li');

        this.beaker = document.getElementById('beaker');
        this.flasks = {
            salicylic: document.getElementById('flask1'),
            acetic: document.getElementById('flask2'),
            sulfuric: document.getElementById('flask3')
        };
        this.buchnerFunnel = document.querySelector('.buchner .equipment');
        this.waterBath = document.querySelector('.water .equipment');
        this.iceBath = document.querySelector('.ice .equipment');
    }

    initState() {
        this.currentStep = 0;
        this.beakerContents = [];
        this.reactionState = {
            isStirring: false,
            isHeating: false,
            isFiltering: false,
            isCooling: false,
            reactionComplete: false
        };
        
        this.chemicalProperties = {
            'Salicylic Acid': { 
                color: 'rgba(100, 149, 237, 0.7)', 
                formula: 'C₇H₆O₃',
                description: 'A phenolic acid used as the starting material for aspirin synthesis. White crystalline powder.'
            },
            'Acetic Anhydride': { 
                color: 'rgba(144, 238, 144, 0.7)', 
                formula: 'C₄H₆O₃',
                description: 'The acetylating agent that reacts with salicylic acid. Colorless liquid with strong odor.'
            },
            'Sulfuric Acid': { 
                color: 'rgba(255, 99, 71, 0.5)', 
                formula: 'H₂SO₄',
                description: 'Strong mineral acid used as a catalyst. Highly corrosive and viscous liquid.'
            },
            'Aspirin': { 
                color: 'rgba(255, 255, 255, 0.9)', 
                formula: 'C₉H₈O₄',
                description: 'Acetylsalicylic acid, the final product. White crystalline powder with mild odor.'
            }
        };
    }

    initCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.particleSystem = new ParticleSystem(this.canvas);
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
    }

    createInfoPanel() {
        this.infoPanel = document.createElement('div');
        this.infoPanel.className = 'info-panel';
        this.infoPanel.innerHTML = `
            <h3>Chemical Information</h3>
            <p>Click on equipment to see details</p>
        `;
        document.body.appendChild(this.infoPanel);
    }

    setupEventListeners() {
        // Tooltip for all equipment
        document.querySelectorAll('.flask, .equipment, .beaker').forEach(el => {
            el.addEventListener('mouseenter', (e) => this.showTooltip(e));
            el.addEventListener('mousemove', (e) => this.moveTooltip(e));
            el.addEventListener('mouseleave', () => this.hideTooltip());
            el.addEventListener('click', () => this.updateInfoPanel(el.dataset.name));
        });

        // Flask interactions
        Object.values(this.flasks).forEach(flask => {
            flask.addEventListener('click', () => this.handleFlaskClick(flask));
        });

        // Equipment interactions
        this.beaker.addEventListener('click', () => this.handleBeakerClick());
        this.buchnerFunnel.addEventListener('click', () => this.handleFiltration());
        this.iceBath.addEventListener('click', () => this.handleCrystallization());
    }

    // Core interaction handlers
    handleFlaskClick(flask) {
        if (flask.classList.contains('disabled')) return;
        
        const chemical = flask.dataset.name;
        const expectedOrder = ['Salicylic Acid', 'Acetic Anhydride', 'Sulfuric Acid'];
        
        if (this.currentStep < 3 && chemical === expectedOrder[this.currentStep]) {
            this.beakerContents.push(chemical);
            this.animateChemicalTransfer(flask, this.beaker);
            this.currentStep++;
            this.updateUI();
            this.updateBeakerVisual();
        } else {
            this.showFeedbackMessage(`Incorrect step! You should add ${expectedOrder[this.currentStep]} next`);
        }
    }

    handleBeakerClick() {
        if (this.beakerContents.length === 3) {
            switch(this.currentStep) {
                case 3:
                    this.startStirring();
                    break;
                case 4:
                    this.startHeating();
                    break;
                default:
                    this.showFeedbackMessage('Complete the previous steps first');
            }
        } else {
            this.showFeedbackMessage('Add all required chemicals first');
        }
    }

    // Process handlers
    startStirring() {
        this.reactionState.isStirring = true;
        this.beaker.style.animation = 'stirring 0.8s ease-in-out 3';
        
        setTimeout(() => {
            this.reactionState.isStirring = false;
            this.beaker.style.animation = '';
            this.currentStep++;
            this.updateUI();
        }, 3000);
    }

    startHeating() {
        this.reactionState.isHeating = true;
        this.beaker.style.animation = 'heating 3s ease-in-out';
        this.particleSystem.emitHeatParticles(200);
        
        setTimeout(() => {
            this.reactionState.isHeating = false;
            this.beaker.style.animation = '';
            this.reactionState.reactionComplete = true;
            this.currentStep++;
            this.updateUI();
            this.updateBeakerVisual(true);
        }, 3000);
    }

    handleFiltration() {
        if (this.currentStep === 5 && this.reactionState.reactionComplete) {
            this.reactionState.isFiltering = true;
            this.buchnerFunnel.style.animation = 'shake 1.5s ease-in-out';
            this.particleSystem.emitFilterParticles(150);
            
            setTimeout(() => {
                this.reactionState.isFiltering = false;
                this.buchnerFunnel.style.animation = '';
                this.currentStep++;
                this.updateUI();
            }, 1500);
        } else {
            this.showFeedbackMessage('Complete the reaction first');
        }
    }

    handleCrystallization() {
        if (this.currentStep === 6 && this.reactionState.reactionComplete) {
            this.reactionState.isCooling = true;
            this.iceBath.style.animation = 'pulse 2s ease-in-out';
            this.particleSystem.emitCrystalParticles(300);
            
            setTimeout(() => {
                this.reactionState.isCooling = false;
                this.iceBath.style.animation = '';
                this.currentStep++;
                this.updateUI();
                this.drawCrystals();
                this.showFeedbackMessage('Aspirin synthesis complete!', 'success');
            }, 2000);
        } else {
            this.showFeedbackMessage('Complete the filtration step first');
        }
    }

    // Visual effects
    animateChemicalTransfer(source, target) {
        const chem = document.createElement('div');
        chem.className = 'flying-chemical';
        chem.innerHTML = '🧪';
        chem.style.position = 'absolute';
        chem.style.left = `${source.getBoundingClientRect().left + source.offsetWidth/2}px`;
        chem.style.top = `${source.getBoundingClientRect().top}px`;
        chem.style.fontSize = '24px';
        chem.style.zIndex = '100';
        document.body.appendChild(chem);

        const anim = chem.animate([
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { 
                transform: `translate(${target.getBoundingClientRect().left - source.getBoundingClientRect().left}px, 
                               ${target.getBoundingClientRect().top - source.getBoundingClientRect().top}px) rotate(360deg)`,
                opacity: 0
            }
        ], { duration: 1000, easing: 'ease-out' });

        anim.onfinish = () => document.body.removeChild(chem);
    }

    updateBeakerVisual(reactionDone = false) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (reactionDone) {
            this.drawChemical('Aspirin', this.canvas.width / 2 - 48, this.canvas.height - 130, 96, 100);
        } else {
            this.beakerContents.forEach((chem, i) => {
                this.drawChemical(chem, 
                    this.canvas.width / 2 - 48, 
                    this.canvas.height - 130 + (i * 20), 
                    96, 
                    100 - (i * 20)
                );
            });
        }
    }

    drawChemical(name, x, y, w, h) {
        const chem = this.chemicalProperties[name];
        this.ctx.fillStyle = chem.color;
        this.ctx.fillRect(x, y, w, h);
        
        // Add chemical formula
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillText(chem.formula, x + 5, y + 20);
    }

    drawCrystals() {
        this.ctx.fillStyle = this.chemicalProperties['Aspirin'].color;
        this.ctx.fillRect(this.canvas.width / 2 - 48, this.canvas.height - 130, 96, 100);
        
        // Draw crystal structures
        for (let i = 0; i < 50; i++) {
            const size = 2 + Math.random() * 5;
            this.ctx.save();
            this.ctx.translate(
                this.canvas.width / 2 - 48 + Math.random() * 96,
                this.canvas.height - 130 + Math.random() * 100
            );
            this.ctx.rotate(Math.random() * Math.PI);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.5})`;
            this.ctx.fillRect(-size/2, -size/2, size, size);
            this.ctx.restore();
        }
    }

    // UI updates
    updateUI() {
        this.updateInstructions();
        this.updateEquipmentStates();
    }

    updateInstructions() {
        this.instructionItems.forEach((item, index) => {
            item.classList.remove('completed', 'current', 'upcoming');
            
            if (index < this.currentStep) {
                item.classList.add('completed');
            } else if (index === this.currentStep) {
                item.classList.add('current');
            } else {
                item.classList.add('upcoming');
            }
        });
    }

    updateEquipmentStates() {
        // Enable/disable equipment based on current step
        Object.values(this.flasks).forEach(flask => {
            if (this.currentStep < 3) {
                flask.classList.remove('disabled');
            } else {
                flask.classList.add('disabled');
            }
        });
        
        this.beaker.style.cursor = this.beakerContents.length === 3 ? 'pointer' : 'default';
        
        if (this.currentStep >= 5 && this.reactionState.reactionComplete) {
            this.buchnerFunnel.classList.remove('disabled');
        } else {
            this.buchnerFunnel.classList.add('disabled');
        }
        
        if (this.currentStep >= 6 && this.reactionState.reactionComplete) {
            this.iceBath.classList.remove('disabled');
        } else {
            this.iceBath.classList.add('disabled');
        }
    }

    // Tooltip methods
    showTooltip(event) {
        const equipment = event.target;
        const name = equipment.dataset.name;
        const chem = this.chemicalProperties[name] || {};
        
        this.tooltip.innerHTML = `
            <strong>${name}</strong>
            ${chem.formula ? `<div>Formula: ${chem.formula}</div>` : ''}
            ${this.getEquipmentDescription(name)}
        `;
        this.tooltip.style.display = 'block';
    }

    getEquipmentDescription(name) {
        const descriptions = {
            'Beaker': 'Container for mixing and reacting chemicals',
            'Buchner Funnel': 'Used for vacuum filtration to separate solids from liquids',
            'Water Bath Machine': 'Provides controlled heating for chemical reactions',
            'Ice Bath': 'Used to cool solutions and promote crystallization'
        };
        
        if (this.chemicalProperties[name]) {
            return `<div class="tooltip-desc">${this.chemicalProperties[name].description}</div>`;
        } else if (descriptions[name]) {
            return `<div class="tooltip-desc">${descriptions[name]}</div>`;
        }
        return '';
    }

    moveTooltip(event) {
        this.tooltip.style.left = `${event.clientX + 15}px`;
        this.tooltip.style.top = `${event.clientY + 15}px`;
    }

    hideTooltip() {
        this.tooltip.style.display = 'none';
    }

    updateInfoPanel(name) {
        const chem = this.chemicalProperties[name] || {};
        if (chem.formula) {
            this.infoPanel.innerHTML = `
                <h3>${name}</h3>
                <p><strong>Formula:</strong> <span class="formula">${chem.formula}</span></p>
                <p>${chem.description}</p>
            `;
        } else {
            this.infoPanel.innerHTML = `
                <h3>${name}</h3>
                <p>${this.getEquipmentDescription(name)}</p>
            `;
        }
    }

    showFeedbackMessage(msg, type = 'error') {
        const feedback = document.createElement('div');
        feedback.className = `feedback-message ${type}`;
        feedback.textContent = msg;
        document.body.appendChild(feedback);
        
        setTimeout(() => {
            feedback.classList.add('fade-out');
            setTimeout(() => document.body.removeChild(feedback), 500);
        }, 3000);
    }
}

// Particle System for visual effects
class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
    }

    emitHeatParticles(count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: this.canvas.width / 2 + (Math.random() - 0.5) * 120,
                y: this.canvas.height - 180 + Math.random() * 30,
                size: Math.random() * 4 + 2,
                color: `hsla(${Math.random() * 20 + 20}, 100%, 50%, ${Math.random() * 0.7 + 0.3})`,
                speed: Math.random() * 3 + 1,
                life: Math.random() * 100 + 50,
                angle: Math.random() * Math.PI * 2
            });
        }
        this.animateParticles();
    }

    emitFilterParticles(count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: this.canvas.width / 2 + (Math.random() - 0.5) * 200,
                y: this.canvas.height - 250,
                size: Math.random() * 5 + 2,
                color: `rgba(200, 200, 255, ${Math.random() * 0.7 + 0.3})`,
                speed: Math.random() * 4 + 1,
                life: Math.random() * 80 + 40,
                angle: Math.random() * Math.PI * 2
            });
        }
        this.animateParticles();
    }

    emitCrystalParticles(count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: this.canvas.width / 2 + (Math.random() - 0.5) * 100,
                y: this.canvas.height - 130 + Math.random() * 100,
                size: Math.random() * 6 + 3,
                color: `rgba(255, 255, 255, ${Math.random() * 0.8 + 0.2})`,
                speed: 0,
                life: Math.random() * 150 + 80,
                angle: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.1
            });
        }
        this.animateParticles();
    }

    animateParticles() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            // Update position and rotation
            p.x += Math.cos(p.angle) * 0.5;
            p.y -= p.speed;
            p.angle += p.rotationSpeed || 0;
            p.life--;
            
            // Draw particle
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.angle);
            this.ctx.fillStyle = p.color;
            
            // Different shapes for different effects
            if (p.speed > 0) {
                // Heat/filter particles (circles)
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.size/2, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                // Crystal particles (rectangles)
                this.ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            }
            
            this.ctx.restore();
            
            // Remove dead particles
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
        
        if (this.particles.length > 0) {
            requestAnimationFrame(() => this.animateParticles());
        }
    }
}

// Initialize the simulation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const simulation = new AspirinSynthesisSim();
    
    // Add a restart button event listener if you add one to your HTML
    document.querySelector('.restart-btn')?.addEventListener('click', () => {
        document.location.reload();
    });
});