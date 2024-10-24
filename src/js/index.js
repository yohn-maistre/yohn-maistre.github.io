import { preloadImages } from './utils';
import { gsap } from 'gsap';

// preload images then remove loader (loading class) 
preloadImages('.tiles__line-img').then(() => document.body.classList.remove('loading'));

// Add this function to your existing JavaScript
function setVH() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Set the value on initial load
setVH();

// frame element
const frame = document.querySelector('.frame');

// overlay (SVG path element)
const overlayPath = document.querySelector('.overlay__path');

// menu (wrap) element
const menuWrap = document.querySelector('.menu-wrap');

// menu items
const menuItems = menuWrap.querySelectorAll('.menu__item');

// open menu button (now the arrow button)
const openMenuCtrl = document.querySelector('button.button-enter');

// close menu button
const closeMenuCtrl = menuWrap.querySelector('.button-close');

// big title elements
const title = {
    main: document.querySelector('.content__title-main'),
    sub: document.querySelector('.content__title-sub')
};

let isAnimating = false;

// opens the menu
const openMenu = () => {
    if (isAnimating) return;
    isAnimating = true;
    sessionStorage.setItem('menuOpen', 'true');
    gsap.timeline({
        onComplete: () => isAnimating = false
    })
    .set(overlayPath, {
        attr: { d: 'M 0 100 V 100 Q 50 100 100 100 V 100 z' }
    })
    .to(overlayPath, { 
        duration: 0.8,
        ease: 'power4.in',
        attr: { d: 'M 0 100 V 50 Q 50 0 100 50 V 100 z' }
    }, 0)
    .to(overlayPath, { 
        duration: 0.3,
        ease: 'power2',
        attr: { d: 'M 0 100 V 0 Q 50 0 100 0 V 100 z' },
        onComplete: () => {
            frame.classList.add('frame--menu-open');
            menuWrap.classList.add('menu-wrap--open');
        }
    })
    // title elements and open menu button
    .to([title.main, title.sub], { 
        duration: 0.8,
        ease: 'power3.in',
        y: -200,
        stagger: 0.05,
        opacity: 0
    }, 0.2)
    // now reveal
    .set(menuItems, { 
        opacity: 0
    })
    .set(overlayPath, { 
        attr: { d: 'M 0 0 V 100 Q 50 100 100 100 V 0 z' }
    })
    .to(overlayPath, { 
        duration: 0.3,
        ease: 'power2.in',
        attr: { d: 'M 0 0 V 50 Q 50 0 100 50 V 0 z' }
    })
    .to(overlayPath, { 
        duration: 0.8,
        ease: 'power4',
        attr: { d: 'M 0 0 V 0 Q 50 0 100 0 V 0 z' }
    })
    // menu items translate animation
    .to(menuItems, { 
        duration: 1.1,
        ease: 'power4',
        startAt: {y: 150},
        y: 0,
        opacity: 1,
        stagger: 0.05
    }, '>-=1.1');
}

// closes the menu
const closeMenu = () => {
    if (isAnimating) return;
    isAnimating = true;
    sessionStorage.setItem('menuOpen', 'false');
    gsap.timeline({
        onComplete: () => isAnimating = false
    })
    .set(overlayPath, {
        attr: { d: 'M 0 0 V 0 Q 50 0 100 0 V 0 z' }
    })
    .to(overlayPath, { 
        duration: 0.8,
        ease: 'power4.in',
        attr: { d: 'M 0 0 V 50 Q 50 100 100 50 V 0 z' }
    }, 0)
    .to(overlayPath, { 
        duration: 0.3,
        ease: 'power2',
        attr: { d: 'M 0 0 V 100 Q 50 100 100 100 V 0 z' },
        onComplete: () => {
            frame.classList.remove('frame--menu-open');
            menuWrap.classList.remove('menu-wrap--open');
        }
    })
    // now reveal
    .set(overlayPath, { 
        attr: { d: 'M 0 100 V 0 Q 50 0 100 0 V 100 z' }
    })
    .to(overlayPath, { 
        duration: 0.3,
        ease: 'power2.in',
        attr: { d: 'M 0 100 V 50 Q 50 100 100 50 V 100 z' }
    })
    .to(overlayPath, { 
        duration: 0.8,
        ease: 'power4',
        attr: { d: 'M 0 100 V 100 Q 50 100 100 100 V 100 z' }
    })
    // title elements and open menu button
    .to([title.main, title.sub], { 
        duration: 1.1,
        ease: 'power4',
        y: 0,
        opacity: 1,
        stagger: -0.05
    }, '>-=1.1')
    // menu items translate animation
    .to(menuItems, { 
        duration: 0.8,
        ease: 'power2.in',
        y: 100,
        opacity: 0,
        stagger: -0.05
    }, 0);
}

// Update the value on resize and orientation change
window.addEventListener('resize', () => {
    setTimeout(setVH, 100);
});

window.addEventListener('orientationchange', () => {
    setTimeout(setVH, 100);
});

// click on menu button
openMenuCtrl.addEventListener('click', openMenu);
// click on close menu button
closeMenuCtrl.addEventListener('click', closeMenu);

// Prevent scrolling when menu is open
menuWrap.addEventListener('wheel', (e) => {
    if (menuWrap.classList.contains('menu-wrap--open')) {
        e.preventDefault();
    }
});

// Check the menu state on page load
document.addEventListener('DOMContentLoaded', () => {
    const menuOpen = sessionStorage.getItem('menuOpen');
    if (menuOpen === 'true') {
        frame.classList.add('frame--menu-open');
        menuWrap.classList.add('menu-wrap--open');
        // You might need to call openMenu() here if you need to trigger animations
    } else {
        // Ensure menu is closed (this handles cases where sessionStorage is empty)
        frame.classList.remove('frame--menu-open');
        menuWrap.classList.remove('menu-wrap--open');
        // You might need to call closeMenu() here if you need to trigger animations
    }
});

// Optional: Close menu on escape key press
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuWrap.classList.contains('menu-wrap--open')) {
        closeMenu();
    }
});

// Optional: Close menu when clicking outside
menuWrap.addEventListener('click', (e) => {
    if (e.target === menuWrap) {
        closeMenu();
    }
});