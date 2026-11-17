const navigationHeader = document.querySelector('.top');

function updateNavigationHeight() {
  document.documentElement.style.setProperty('--navigation-height', `${navigationHeader.getBoundingClientRect().height}px`);
}

function updateFloatingNavigation() {
  navigationHeader.classList.toggle('top-floating', window.scrollY >= 75);
}

// Reserve the header's space so fixing it doesn't move the content or change scroll position.
updateNavigationHeight();
updateFloatingNavigation();
new ResizeObserver(updateNavigationHeight).observe(navigationHeader);
window.addEventListener('scroll', updateFloatingNavigation, { passive: true });
window.addEventListener('pageshow', updateFloatingNavigation);

if (document.getElementById('planner') && window.location.hash === '#tournaments') {
  window.location.replace('tournaments.html');
}

// Keep a repeated click in the resting palette even while the pointer stays over it.
document.addEventListener('click', event => {
  const control = event.target.closest('button');
  if (!control || control.disabled) return;
  if (control.dataset.tournament) {
    for (const replacement of document.querySelectorAll('[data-tournament]')) {
      if (replacement.dataset.tournament === control.dataset.tournament) {
        replacement.setAttribute('data-resting', '');
      }
    }
    return;
  }
  const expanded = control.getAttribute('aria-expanded');
  if (expanded !== null) {
    control.toggleAttribute('data-resting', expanded === 'false');
    return;
  }
  const inverted = control.dataset.inverted !== 'true';
  control.dataset.inverted = String(inverted);
  control.toggleAttribute('data-resting', !inverted);
});

document.addEventListener('pointerout', event => {
  const control = event.target.closest('button, summary');
  if (control && !control.contains(event.relatedTarget)) control.removeAttribute('data-resting');
});

document.addEventListener('toggle', event => {
  if (event.target.tagName !== 'DETAILS') return;
  event.target.querySelector(':scope > summary')?.toggleAttribute('data-resting', !event.target.open);
}, true);
