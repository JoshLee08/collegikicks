const navigationHeader = document.querySelector('.top');

function updateNavigationHeight() {
  document.documentElement.style.setProperty('--navigation-height', `${navigationHeader.getBoundingClientRect().height}px`);
}

function updateFloatingNavigation() {
  navigationHeader.classList.toggle('top-floating', window.scrollY >= 50);
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
