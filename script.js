/* ============================================
   ugcgo.ai — Landing Page JavaScript
   ============================================ */

(function () {
    'use strict';

    // ========================================
    // PARTICLE SYSTEM
    // ========================================
    class ParticleSystem {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.particles = [];
            this.mouse = { x: 0, y: 0 };
            this.particleCount = 80;
            this.connectionDistance = 120;
            this.isDark = document.documentElement.getAttribute('data-theme') === 'dark';

            this.resize();
            this.init();
            this.animate();

            window.addEventListener('resize', () => this.resize());
            this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.mouse.x = e.clientX - rect.left;
                this.mouse.y = e.clientY - rect.top;
            });
        }

        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.canvas.width = this.canvas.offsetWidth * dpr;
            this.canvas.height = this.canvas.offsetHeight * dpr;
            this.ctx.scale(dpr, dpr);
            this.width = this.canvas.offsetWidth;
            this.height = this.canvas.offsetHeight;
        }

        init() {
            this.particles = [];
            for (let i = 0; i < this.particleCount; i++) {
                this.particles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    radius: Math.random() * 1.5 + 0.5,
                    opacity: Math.random() * 0.5 + 0.1,
                });
            }
        }

        updateTheme(isDark) {
            this.isDark = isDark;
        }

        animate() {
            this.ctx.clearRect(0, 0, this.width, this.height);

            const accentColor = this.isDark ? '232, 255, 89' : '26, 26, 26';

            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];

                // Move
                p.x += p.vx;
                p.y += p.vy;

                // Bounce
                if (p.x < 0 || p.x > this.width) p.vx *= -1;
                if (p.y < 0 || p.y > this.height) p.vy *= -1;

                // Mouse interaction
                const dx = this.mouse.x - p.x;
                const dy = this.mouse.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    p.vx -= dx * 0.0002;
                    p.vy -= dy * 0.0002;
                }

                // Draw particle
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(${accentColor}, ${p.opacity})`;
                this.ctx.fill();

                // Draw connections
                for (let j = i + 1; j < this.particles.length; j++) {
                    const p2 = this.particles[j];
                    const ddx = p.x - p2.x;
                    const ddy = p.y - p2.y;
                    const distance = Math.sqrt(ddx * ddx + ddy * ddy);

                    if (distance < this.connectionDistance) {
                        const lineOpacity = (1 - distance / this.connectionDistance) * 0.15;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p.x, p.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.strokeStyle = `rgba(${accentColor}, ${lineOpacity})`;
                        this.ctx.lineWidth = 0.5;
                        this.ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(() => this.animate());
        }
    }

    // ========================================
    // THEME TOGGLE
    // ========================================
    const themeToggle = document.getElementById('themeToggle');
    let particleSystem = null;

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ugcgo-theme', theme);
        if (particleSystem) {
            particleSystem.updateTheme(theme === 'dark');
        }
    }

    // Load saved theme
    const savedTheme = localStorage.getItem('ugcgo-theme') || 'dark';
    setTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // ========================================
    // SCROLL REVEAL
    // ========================================
    function setupReveal() {
        const reveals = document.querySelectorAll('.reveal-up');

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px',
            }
        );

        reveals.forEach((el, index) => {
            el.style.transitionDelay = `${index % 5 * 0.1}s`;
            observer.observe(el);
        });
    }

    // ========================================
    // COUNTER ANIMATION
    // ========================================
    function animateCounters() {
        const counters = document.querySelectorAll('[data-count]');

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        const target = parseInt(el.getAttribute('data-count'), 10);
                        const duration = 2000;
                        const startTime = performance.now();

                        function update(currentTime) {
                            const elapsed = currentTime - startTime;
                            const progress = Math.min(elapsed / duration, 1);

                            // Easing: ease-out cubic
                            const eased = 1 - Math.pow(1 - progress, 3);
                            const current = Math.round(eased * target);

                            el.textContent = current.toLocaleString();

                            if (progress < 1) {
                                requestAnimationFrame(update);
                            }
                        }

                        requestAnimationFrame(update);
                        observer.unobserve(el);
                    }
                });
            },
            { threshold: 0.5 }
        );

        counters.forEach((counter) => observer.observe(counter));
    }

    // ========================================
    // NAV SCROLL EFFECT
    // ========================================
    function setupNav() {
        const nav = document.getElementById('nav');
        let lastScrollY = 0;

        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY > 50) {
                nav.classList.add('nav--scrolled');
            } else {
                nav.classList.remove('nav--scrolled');
            }
            lastScrollY = scrollY;
        });

        // Mobile burger
        const burger = document.getElementById('navBurger');
        const mobileMenu = document.getElementById('navMobile');

        if (burger && mobileMenu) {
            burger.addEventListener('click', () => {
                burger.classList.toggle('active');
                mobileMenu.classList.toggle('active');
            });

            // Close on link click
            mobileMenu.querySelectorAll('a').forEach((link) => {
                link.addEventListener('click', () => {
                    burger.classList.remove('active');
                    mobileMenu.classList.remove('active');
                });
            });
        }
    }

    // ========================================
    // SMOOTH SCROLL FOR ANCHOR LINKS
    // ========================================
    function setupSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    const offset = 80;
                    const top = target.getBoundingClientRect().top + window.scrollY - offset;
                    window.scrollTo({ top, behavior: 'smooth' });
                }
            });
        });
    }

    // ========================================
    // WAITLIST FORM
    // ========================================
    function setupForm() {
        const form = document.getElementById('waitlistForm');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = form.querySelector('.waitlist-form__btn span');
            const originalText = btn.textContent;

            btn.textContent = 'Added!';
            form.querySelector('.waitlist-form__input').value = '';

            setTimeout(() => {
                btn.textContent = originalText;
            }, 3000);
        });
    }

    // ========================================
    // MAGNETIC HOVER EFFECT ON BUTTONS
    // ========================================
    function setupMagneticButtons() {
        const buttons = document.querySelectorAll('.btn--primary, .nav__cta');

        buttons.forEach((btn) => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
            });
        });
    }

    // ========================================
    // TILT EFFECT ON CARDS
    // ========================================
    function setupCardTilt() {
        const cards = document.querySelectorAll('.feature-card, .pricing-card, .testimonial-card');

        cards.forEach((card) => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                const tiltX = (y - 0.5) * 4;
                const tiltY = (x - 0.5) * -4;

                card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-4px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    // ========================================
    // CURSOR GLOW EFFECT
    // ========================================
    function setupCursorGlow() {
        const glow = document.createElement('div');
        glow.style.cssText = `
            position: fixed;
            width: 300px;
            height: 300px;
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            mix-blend-mode: screen;
            opacity: 0;
            transition: opacity 0.3s ease;
            transform: translate(-50%, -50%);
        `;
        document.body.appendChild(glow);

        function updateGlow() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            glow.style.background = isDark
                ? 'radial-gradient(circle, rgba(232,255,89,0.04) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 70%)';
        }

        updateGlow();

        // Update on theme change
        const observer = new MutationObserver(updateGlow);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        document.addEventListener('mousemove', (e) => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
            glow.style.opacity = '1';
        });

        document.addEventListener('mouseleave', () => {
            glow.style.opacity = '0';
        });
    }

    // ========================================
    // PARALLAX ON HERO ELEMENTS
    // ========================================
    function setupParallax() {
        const heroContent = document.querySelector('.hero__content');
        const heroCards = document.querySelector('.hero__cards');

        if (!heroContent || !heroCards) return;

        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            const factor = Math.min(scrollY / 600, 1);

            heroContent.style.transform = `translateY(${scrollY * 0.15}px)`;
            heroContent.style.opacity = 1 - factor;
            heroCards.style.transform = `translateY(${scrollY * 0.08}px)`;
        });
    }

    // ========================================
    // INITIALIZE
    // ========================================
    document.addEventListener('DOMContentLoaded', () => {
        particleSystem = new ParticleSystem('particleCanvas');
        setupReveal();
        animateCounters();
        setupNav();
        setupSmoothScroll();
        setupForm();
        setupMagneticButtons();
        setupCardTilt();
        setupCursorGlow();
        setupParallax();
    });
})();
