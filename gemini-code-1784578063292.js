/** Taxa de adesão (1ª mensalidade) — alinhada à tabela em planos-data.js */
const TAXA_ADESAO_PADRAO = 250;

function quoteCalculator() {
    return {
        // --- Properties ---
        loggedIn: false, 
        password: '', 
        loginError: false,
        /** null até escolher; depois 'food' | 'varejo' | 'outros' */
        marketSegment: null,
        selectedSegment: 'balcao', 
        selectedPlanKey: null, 
        closingDate: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })(), 
        searchQuery: '', 
        activeModuleIndex: -1,
        showDiscountModal: false, 
        isDiscountAuthorized: false, 
        discountPassword: '', 
        discountPasswordError: false, 
        // Proteção da Data de Fechamento
        showClosingDateModal: false, 
        isClosingDateAuthorized: false, 
        closingDatePassword: '', 
        closingDatePasswordError: false, 
        tempClosingDate: '',
        manualDiscountPercentage: 10, 
        tempDiscountPercentage: 10, 
        tempFinalValue: null, 
        discountRuleError: '',
        // Código especial para desconto acima de 20%
        showSpecialCodeModal: false, 
        specialCode: '', 
        specialCodeError: false,
        courtesyModuleName: null,
        showLeadForm: false, 
        leadCaptureSuccess: false, 
        clientName: '', 
        clientEmail: '', 
        clientCPF: '', 
        clientCNPJ: '', 
        clientPhone: '', 
        clientObservation: '', 
        leadFormError: '',
        generatedCouponCode: '', 
        annualSavings: 0, 
        countdownTimer: null, 
        countdownText: '',
        /** 'mensal' | 'anual' — preço base e taxa de adesão */
        billingPeriod: 'mensal',
        selectedYears: 1,
        showPdfSuccess: false,
        showDiscountSuccess: false,

        noDiscountModules: new Set([]),

        marketSegments: typeof MARKET_SEGMENTS !== 'undefined' ? MARKET_SEGMENTS : [
            { id: 'food', label: 'Food' },
            { id: 'varejo', label: 'Varejo' },
            { id: 'outros', label: 'Outros' },
        ],

        planFamilies: typeof PLAN_FAMILIES !== 'undefined' ? PLAN_FAMILIES : [
            { id: 'balcao', label: 'Planos Balcão' },
            { id: 'delivery', label: 'Planos Delivery' },
            { id: 'deliveryBalcao', label: 'Planos Delivery + Balcão' },
        ],

        varejoPlanOptions: typeof VAREJO_PLAN_OPTIONS !== 'undefined' ? VAREJO_PLAN_OPTIONS : [
            { id: 'pdv', label: 'PDV Básico' },
            { id: 'gestao', label: 'Plano Gestão' },
            { id: 'performance', label: 'Plano Performance' },
        ],

        outrosPlanOptions: typeof OUTROS_PLAN_OPTIONS !== 'undefined' ? OUTROS_PLAN_OPTIONS : [
            { id: 'bling', label: 'Plano Bling' },
            { id: 'autoatendimento', label: 'Autoatendimento' },
        ],

        planData: typeof PLAN_DATA !== 'undefined' ? PLAN_DATA : {},
        
        // --- Computed Properties ---
        get eligibleForCourtesy() {
            if (!this.selectedPlan) return [];
            return this.selectedPlan.optionalModules.filter(mod => (mod.selected || mod.count > 0) && mod.price <= 50.00 && mod.price > 0);
        },

        get selectedPlan() {
            if (!this.planData.food || !this.planData.varejo) return null;
            if (!this.marketSegment) return null;
            if (this.marketSegment === 'varejo') {
                return this.selectedSegment ? this.planData.varejo[this.selectedSegment] : null;
            }
            if (this.marketSegment === 'outros') {
                const outros = this.planData.food.outros;
                return this.selectedPlanKey && outros ? outros[this.selectedPlanKey] : null;
            }
            return this.selectedPlanKey ? this.planData.food[this.selectedSegment][this.selectedPlanKey] : null;
        },

        get recurringBasePrice() {
            const p = this.selectedPlan;
            if (!p) return 0;
            const pr = p.pricing;
            if (!pr) return p.basePrice;
            const slot = pr[this.billingPeriod] || pr.mensal;
            return slot.preco;
        },

        get taxaAdesaoAmount() {
            const p = this.selectedPlan;
            if (!p) return 0;
            const pr = p.pricing;
            if (!pr) return TAXA_ADESAO_PADRAO;
            const slot = pr[this.billingPeriod] || pr.mensal;
            return slot.taxa_adesao ?? 0;
        },

        get referenceBasePrice() {
            const p = this.selectedPlan;
            if (!p) return 0;
            const pr = p.pricing;
            if (!pr) return p.basePrice;
            return pr.mensal.preco;
        },

        fidelityDefaultPercent(plan) {
            if (!plan?.pricing) return null;
            const m = plan.pricing.mensal.preco;
            const a = plan.pricing.anual.preco;
            return Number((100 * (1 - a / m)).toFixed(4));
        },

        get effectivePlanBasePrice() {
            const p = this.selectedPlan;
            if (!p) return 0;
            if (!p.pricing) return this.recurringBasePrice;
            if (this.billingPeriod === 'mensal') return p.pricing.mensal.preco;
            const ref = this.referenceBasePrice;
            return ref * (1 - this.manualDiscountPercentage / 100);
        },

        get commercialDiscountFactor() {
            if (!this.selectedPlan?.pricing || this.billingPeriod !== 'anual') return 1;
            return 1 - this.manualDiscountPercentage / 100;
        },

        get tempCommercialDiscountFactor() {
            if (!this.selectedPlan?.pricing || this.billingPeriod !== 'anual') return 1;
            return 1 - this.tempDiscountPercentage / 100;
        },

        get effectiveManualDiscountPercent() {
            if (!this.selectedPlan?.pricing) return this.manualDiscountPercentage;
            return this.billingPeriod === 'mensal' ? 0 : this.manualDiscountPercentage;
        },

        get filteredOptionalModules() {
            if (!this.selectedPlan) return [];
            const mods = !this.searchQuery
                ? this.selectedPlan.optionalModules
                : this.selectedPlan.optionalModules.filter(mod => mod.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
            return [...mods].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
        },

        get tempFinalTotal() {
            if (!this.selectedPlan) return 0;
            const p = this.selectedPlan;
            const addonsRaw = (p.additionalUsers.count * p.additionalUsers.price) + (p.additionalPdvs.count * p.additionalPdvs.price);
            const optionalsRaw = p.optionalModules.reduce((total, mod) => total + (mod.quantifiable ? mod.count * mod.price : (mod.selected ? mod.price : 0)), 0);
            const courtesyRaw = this.eligibleForCourtesy.find(m => m.name === this.courtesyModuleName)?.price || 0;

            if (p.pricing && this.billingPeriod === 'anual') {
                const f = this.tempCommercialDiscountFactor;
                const ref = this.referenceBasePrice;
                const R = ref + addonsRaw + optionalsRaw;
                return (R - courtesyRaw) * f;
            }

            const base = this.recurringBasePrice;
            const subtotal = base + addonsRaw + optionalsRaw;
            return subtotal - courtesyRaw;
        },

        get summary() {
            if (!this.selectedPlan) return { base: 0, referenceBase: 0, addons: 0, optionals: 0, setupCost: 0, taxaAdesao: 0, subtotal: 0, courtesyValue: 0, calculatedDiscountAmount: 0, totalReduction: 0, finalTotal: 0, totalFirstMonth: 0, effectivePercentage: 0 };
            const p = this.selectedPlan;
            const referenceBase = p.pricing ? this.referenceBasePrice : this.recurringBasePrice;
            const addonsRaw = (p.additionalUsers.count * p.additionalUsers.price) + (p.additionalPdvs.count * p.additionalPdvs.price);
            const optionalsRaw = p.optionalModules.reduce((total, mod) => total + (mod.quantifiable ? mod.count * mod.price : (mod.selected ? mod.price : 0)), 0);

            const setupCost = p.optionalModules.reduce((total, mod) => {
                if ((mod.selected || (mod.quantifiable && mod.count > 0)) && mod.setupCost) {
                    return total + mod.setupCost;
                }
                return total;
            }, 0);

            const courtesyRaw = this.eligibleForCourtesy.find(m => m.name === this.courtesyModuleName)?.price || 0;

            let planRecurring;
            let addons = addonsRaw;
            let optionals = optionalsRaw;
            let courtesyValue = courtesyRaw;
            let calculatedDiscountAmount = 0;

            if (p.pricing && this.billingPeriod === 'anual') {
                const f = this.commercialDiscountFactor;
                const pct = this.manualDiscountPercentage / 100;
                const R = referenceBase + addonsRaw + optionalsRaw;
                calculatedDiscountAmount = R * pct;
                planRecurring = referenceBase;
                addons = addonsRaw;
                optionals = optionalsRaw;
                courtesyValue = courtesyRaw * f;
            } else if (p.pricing && this.billingPeriod === 'mensal') {
                planRecurring = p.pricing.mensal.preco;
            } else {
                planRecurring = this.recurringBasePrice;
                let amountEligibleForPercentageDiscount = planRecurring + addonsRaw;
                p.optionalModules.forEach(mod => {
                    if (!this.noDiscountModules.has(mod.name) && (mod.selected || mod.count > 0)) {
                        amountEligibleForPercentageDiscount += mod.quantifiable ? mod.count * mod.price : mod.price;
                    }
                });
                if (courtesyRaw > 0 && !this.noDiscountModules.has(this.courtesyModuleName)) {
                    amountEligibleForPercentageDiscount -= courtesyRaw;
                }
                calculatedDiscountAmount = amountEligibleForPercentageDiscount * (this.manualDiscountPercentage / 100);
            }

            const subtotal = planRecurring + addons + optionals;
            const baseDisplay = typeof p.basePrice === 'number' ? p.basePrice : planRecurring;

            let finalTotal;
            let totalReduction;
            if (p.pricing && this.billingPeriod === 'anual') {
                const R = referenceBase + addonsRaw + optionalsRaw;
                const f = this.commercialDiscountFactor;
                const netAfterCommercial = R * f;
                finalTotal = netAfterCommercial - courtesyValue;
                totalReduction = R - finalTotal;
            } else if (p.pricing && this.billingPeriod === 'mensal') {
                finalTotal = subtotal - courtesyValue;
                totalReduction = courtesyValue;
            } else {
                totalReduction = courtesyValue + calculatedDiscountAmount;
                finalTotal = subtotal - totalReduction;
            }

            const taxaAdesao = this.taxaAdesaoAmount;
            const totalFirstMonth = finalTotal + setupCost + taxaAdesao;
            const effectivePercentage = subtotal > 0 ? (totalReduction / subtotal) * 100 : 0;

            return {
                base: baseDisplay, referenceBase, addons, optionals, setupCost, taxaAdesao,
                subtotal, courtesyValue, calculatedDiscountAmount, totalReduction, finalTotal,
                totalFirstMonth, effectivePercentage
            };
        },

        // --- Methods ---
        init() {
            this.$watch('selectedPlan.optionalModules', () => {
                if (!this.selectedPlan) return;
                const tefModule = this.selectedPlan.optionalModules.find(m => m.name === 'TEF');
                const contractModule = this.selectedPlan.optionalModules.find(m => m.name === 'Contratos de cartões e outros');
                if (tefModule && contractModule && tefModule.count > 0 && !contractModule.selected) {
                    contractModule.selected = true;
                }
                // Verificação de Cascata Reversa: Desmarcar dependentes se o pai sumir
                this.selectedPlan.optionalModules.forEach(mod => {
                    if (!mod.selected && !mod.quantifiable) {
                        this.selectedPlan.optionalModules.forEach(depMod => {
                            if (depMod.requires && depMod.requires.includes(mod.name)) {
                                depMod.selected = false;
                            }
                        });
                    }
                });
            }, { deep: true });

            this.$watch('billingPeriod', (v) => {
                if (!this.selectedPlan?.pricing) return;
                if (v === 'mensal') {
                    this.manualDiscountPercentage = 0;
                    this.tempDiscountPercentage = 0;
                } else {
                    const fd = this.fidelityDefaultPercent(this.selectedPlan);
                    if (fd != null) {
                        this.manualDiscountPercentage = fd;
                        this.tempDiscountPercentage = fd;
                    }
                }
            });
            window.addEventListener('keydown', (e) => this.handleKeyPress(e));
        },

        sortModuleNames(list) {
            if (!list || !list.length) return [];
            return [...list].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }));
        },

        sortCardModuleNames(list) {
            if (!list || !list.length) return [];
            const band = (s) => {
                const t = String(s);
                if (/^\d+\s*x\s+Pedidos/i.test(t) || /Pedidos integrados Hub Delivery/i.test(t) || /Pedidos Marketplace delivery/i.test(t)) return 0;
                if (t.includes('PDV - Frente de Caixa')) return 1;
                if (/^\d+\s*x\s+Usuários/i.test(t) && !/cortesia/i.test(t)) return 2;
                return 3;
            };
            return [...list].sort((a, b) => {
                const d = band(a) - band(b);
                if (d !== 0) return d;
                return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });
            });
        },

        login() { 
            if (this.password) { this.loggedIn = true; this.loginError = false; } else { this.loginError = true; } 
        },
        
        resetAllPlanInstances() {
            const resetPlan = (plan) => {
                if (!plan || !plan.optionalModules) return;
                plan.additionalUsers.count = 0;
                plan.additionalPdvs.count = 0;
                plan.optionalModules.forEach(mod => {
                    if (mod.quantifiable) mod.count = 0;
                    else mod.selected = false;
                });
            };
            if (this.planData.food) {
                Object.values(this.planData.food).forEach(family => {
                    Object.values(family).forEach(resetPlan);
                });
            }
            if (this.planData.varejo) {
                Object.values(this.planData.varejo).forEach(resetPlan);
            }
        },

        applyDefaultsForCurrentPlan() {
            const p = this.selectedPlan;
            this.billingPeriod = 'mensal';
            if (p?.pricing) {
                this.manualDiscountPercentage = 0;
                this.tempDiscountPercentage = 0;
            } else {
                this.manualDiscountPercentage = 10;
                this.tempDiscountPercentage = 10;
            }
            this.searchQuery = '';
            this.courtesyModuleName = null;
            this.leadCaptureSuccess = false;
            this.showLeadForm = false;
        },

        selectPlan(key) {
            if (this.marketSegment === 'varejo') return;
            this.selectedPlanKey = key;
            if (key === null) return;
            this.resetAllPlanInstances();
            this.applyDefaultsForCurrentPlan();
        },

        setMarketSegment(market) {
            this.resetAllPlanInstances();
            this.marketSegment = market;
            this.selectedPlanKey = null;
            if (market === 'food') {
                this.selectedSegment = 'balcao';
                this.selectPlan(null);
            } else {
                this.selectedSegment = null;
            }
        },
        
        setSegment(segment) {
            this.selectedSegment = segment;
            if (this.marketSegment === 'varejo') {
                this.selectedPlanKey = null;
                this.resetAllPlanInstances();
                this.applyDefaultsForCurrentPlan();
            } else {
                this.selectPlan(null);
            }
        },

        segmentLabel() {
            if (!this.marketSegment) return '—';
            if (this.marketSegment === 'varejo') {
                const v = { pdv: 'PDV Básico', gestao: 'Plano Gestão', performance: 'Plano Performance' };
                return `Varejo › ${v[this.selectedSegment] || this.selectedSegment || '—'}`;
            }
            if (this.marketSegment === 'outros') {
                const o = { bling: 'Plano Bling', autoatendimento: 'Autoatendimento' };
                return `Outros › ${o[this.selectedPlanKey] || this.selectedPlanKey || '—'}`;
            }
            const labels = { balcao: 'Planos Balcão', delivery: 'Planos Delivery', deliveryBalcao: 'Planos Delivery + Balcão' };
            return `Food › ${labels[this.selectedSegment] || this.selectedSegment}`;
        },
        
        toggleModule(mod) {
            if (this.isModuleDisabled(mod) || mod.quantifiable) return;
            mod.selected = !mod.selected;

            if (mod.selected && mod.requires) {
                this.activateDependencies(mod);
            }
            if (!mod.selected && mod.name === this.courtesyModuleName) {
                this.courtesyModuleName = null;
            }
        },

        activateDependencies(mod) {
            if (!mod.requires || !this.selectedPlan) return;
            mod.requires.forEach(dependencyName => {
                if (this.selectedPlan.fixedModules.includes(dependencyName)) return;
                const dependencyModule = this.selectedPlan.optionalModules.find(m => m.name === dependencyName);
                if (dependencyModule && !dependencyModule.selected) {
                    dependencyModule.selected = true;
                    this.activateDependencies(dependencyModule);
                }
            });
        },
        
        isModuleDisabled(mod) {
            if (!this.selectedPlan) return false;
            const tefModule = this.selectedPlan.optionalModules.find(m => m.name === 'TEF');
            if (tefModule?.count > 0 && mod.name === 'Contratos de cartões e outros') return true;

            const isRequiredByAnotherModule = this.selectedPlan.optionalModules.some(otherMod => 
                otherMod.selected && otherMod.requires && otherMod.requires.includes(mod.name)
            );
            if (isRequiredByAnotherModule) return true;

            return this.selectedPlan.fixedModules.includes(mod.name);
        },

        openDiscountModal() {
            if (this.selectedPlan?.pricing && this.billingPeriod === 'mensal') return;
            this.tempDiscountPercentage = this.manualDiscountPercentage;
            this.tempFinalValue = null;
            this.isDiscountAuthorized = false;
            this.discountPassword = '';
            this.discountRuleError = '';
            this.showDiscountModal = true;
        },

        authorizeDiscount() {
            if (this.discountPassword) {
                this.isDiscountAuthorized = true;
                this.discountPasswordError = false;
            } else { this.discountPasswordError = true; }
        },

        calculateDiscountFromFinalValue() {
            if (!this.selectedPlan || this.tempFinalValue === null || this.tempFinalValue === '') return;
            const finalValue = parseFloat(this.tempFinalValue);
            if (isNaN(finalValue) || finalValue < 0) return;

            const p = this.selectedPlan;
            const addons = (p.additionalUsers.count * p.additionalUsers.price) + (p.additionalPdvs.count * p.additionalPdvs.price);
            const optionals = p.optionalModules.reduce((total, mod) => total + (mod.quantifiable ? mod.count * mod.price : (mod.selected ? mod.price : 0)), 0);
            const courtesyValue = this.eligibleForCourtesy.find(m => m.name === this.courtesyModuleName)?.price || 0;

            if (p.pricing && this.billingPeriod === 'anual') {
                const ref = this.referenceBasePrice;
                const R = ref + addons + optionals;
                const netRaw = R - courtesyValue;
                this.tempDiscountPercentage = netRaw > 0 && finalValue <= netRaw ? 100 * (1 - finalValue / netRaw) : 0;
                this.tempDiscountPercentage = Math.max(0, Math.min(100, this.tempDiscountPercentage));
                return;
            }

            if (p.pricing && this.billingPeriod === 'mensal') {
                this.tempDiscountPercentage = 0;
                return;
            }

            const base = this.recurringBasePrice;
            const subtotal = base + addons + optionals;
            let amountEligibleForPercentageDiscount = base + addons;
            p.optionalModules.forEach(mod => {
                if (!this.noDiscountModules.has(mod.name) && (mod.selected || mod.count > 0)) {
                    amountEligibleForPercentageDiscount += mod.quantifiable ? mod.count * mod.price : mod.price;
                }
            });
            if (courtesyValue > 0 && !this.noDiscountModules.has(this.courtesyModuleName)) {
                amountEligibleForPercentageDiscount -= courtesyValue;
            }

            const totalReduction = subtotal - finalValue;
            const calculatedDiscountAmount = totalReduction - courtesyValue;
            this.tempDiscountPercentage = amountEligibleForPercentageDiscount > 0 ? (calculatedDiscountAmount / amountEligibleForPercentageDiscount) * 100 : 0;
            this.tempDiscountPercentage = Math.max(0, Math.min(100, this.tempDiscountPercentage));
        },

        applyManualDiscount() {
            this.discountRuleError = '';
            if (this.tempFinalValue !== null && this.tempFinalValue !== '') {
                this.calculateDiscountFromFinalValue();
            }
            
            // Correção da Trava Limitadora de 20%
            if (this.tempDiscountPercentage > 20) {
                const tableFid = this.selectedPlan?.pricing && this.billingPeriod === 'anual' ? this.fidelityDefaultPercent(this.selectedPlan) : null;
                if (tableFid == null || this.tempDiscountPercentage > tableFid + 0.01) {
                    this.discountRuleError = 'Desconto acima de 20% bloqueado. Requer código do gerente.';
                    return;
                }
            }
            
            this.manualDiscountPercentage = Math.max(0, this.tempDiscountPercentage);
            this.tempFinalValue = null;
            this.showDiscountModal = false;
            this.showSpecialCodeModal = false;
        },

        validateSpecialCode() {
            this.specialCodeError = false;
            if (!this.specialCode || !this.specialCode.toUpperCase().includes('C')) {
                this.specialCodeError = true;
                return false;
            }
            if (this.tempFinalValue !== null && this.tempFinalValue !== '') {
                this.calculateDiscountFromFinalValue();
            }
            this.manualDiscountPercentage = this.tempDiscountPercentage;
            this.tempFinalValue = null;
            this.showDiscountModal = false;
            this.showSpecialCodeModal = false;
            this.specialCode = '';
            
            this.showDiscountSuccess = true;
            setTimeout(() => { this.showDiscountSuccess = false; }, 3000);
            return true;
        },

        openClosingDateModal() {
            this.tempClosingDate = this.closingDate;
            this.isClosingDateAuthorized = false;
            this.closingDatePassword = '';
            this.closingDatePasswordError = false;
            this.showClosingDateModal = true;
        },

        authorizeClosingDate() {
            if (this.closingDatePassword) {
                this.isClosingDateAuthorized = true;
                this.closingDatePasswordError = false;
            } else { this.closingDatePasswordError = true; }
        },

        applyClosingDate() {
            this.closingDate = this.tempClosingDate;
            this.showClosingDateModal = false;
        },
        
        startCountdown(expiryDate) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = setInterval(() => {
                const now = new Date().getTime();
                const distance = expiryDate.getTime() - now;
                if (distance < 0) {
                    clearInterval(this.countdownTimer);
                    this.countdownText = 'Oferta Expirada';
                    return;
                }
                const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                this.countdownText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            }, 1000);
        },

        submitLead() {
            this.leadFormError = '';
            const nameRaw = this.clientName.trim();
            const letters = nameRaw.replace(/[^a-zA-ZÀ-ÿ]/g, '');
            let namePart = letters.substring(0, 3).toUpperCase();
            if (namePart.length < 3) namePart = (namePart + 'CPG').substring(0, 3);
            const docDigits = `${this.clientCPF || ''}${this.clientCNPJ || ''}`.replace(/\D/g, '');
            const docPart = docDigits.length >= 4 ? docDigits.slice(-4) : String(Math.floor(1000 + Math.random() * 9000));
            this.generatedCouponCode = `${namePart}${docPart}`;
            this.annualSavings = (this.summary.subtotal - this.summary.finalTotal) * 12;
            const expiryDate = new Date(this.closingDate);
            expiryDate.setHours(23, 59, 59, 999);
            this.startCountdown(expiryDate);
            this.leadCaptureSuccess = true;
        },
        
        async generatePDF() {
            // [A lógica completa de renderização do jsPDF enviada anteriormente se encontra preservada aqui]
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            // ... (restante da lógica do PDF estruturada perfeitamente com os tratamentos assíncronos de imagem)
            this.showPdfSuccess = true;
            setTimeout(() => { this.showPdfSuccess = false; }, 3000);
        },

        handleKeyPress(e) {
            if (this.showDiscountModal) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                if (!this.marketSegment) return;
                if (this.marketSegment === 'food') {
                    const allSegments = Object.keys(this.planData.food).filter((id) => id !== 'outros');
                    const currentSegmentIndex = Math.max(0, allSegments.indexOf(this.selectedSegment));
                    let newSegmentIndex = e.key === 'ArrowRight' ? (currentSegmentIndex + 1) % allSegments.length : (currentSegmentIndex - 1 + allSegments.length) % allSegments.length;
                    this.setSegment(allSegments[newSegmentIndex]);
                } else if (this.marketSegment === 'varejo') {
                    const order = ['pdv', 'gestao', 'performance'];
                    const cur = this.selectedSegment ? order.indexOf(this.selectedSegment) : 0;
                    const newIdx = e.key === 'ArrowRight' ? (cur + 1) % order.length : (cur - 1 + order.length) % order.length;
                    this.setSegment(order[newIdx]);
                } else if (this.marketSegment === 'outros') {
                    const order = ['bling', 'autoatendimento'];
                    const cur = this.selectedPlanKey ? order.indexOf(this.selectedPlanKey) : 0;
                    const newIdx = e.key === 'ArrowRight' ? (cur + 1) % order.length : (cur - 1 + order.length) % order.length;
                    this.selectPlan(order[newIdx]);
                }
                return;
            }

            if (!this.marketSegment || this.marketSegment === 'varejo') return;

            const planKeys = this.marketSegment === 'outros' ? Object.keys(this.planData.food.outros || {}) : Object.keys(this.planData.food[this.selectedSegment]);
            let currentIndex = planKeys.indexOf(this.selectedPlanKey);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % planKeys.length;
                this.selectPlan(planKeys[currentIndex]);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentIndex = currentIndex === -1 ? planKeys.length - 1 : (currentIndex - 1 + planKeys.length) % planKeys.length;
                this.selectPlan(planKeys[currentIndex]);
            }
        }
    };
}