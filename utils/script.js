const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('[data-menu-button]');
const mobileMenu = document.querySelector('[data-mobile-menu]');

window.addEventListener('scroll', () => {
  header?.classList.toggle('scrolled', window.scrollY > 12);
}, { passive: true });

menuButton?.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  document.body.classList.toggle('menu-open', isOpen);
});

mobileMenu?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  });
});

const viewToggle = document.querySelector('[data-view-toggle]');
const listView = document.querySelector('[data-list-view]');
const mapView = document.querySelector('[data-map-view]');

viewToggle?.addEventListener('click', () => {
  const showingMap = !mapView.hidden;
  mapView.hidden = showingMap;
  listView.hidden = !showingMap;
  viewToggle.textContent = showingMap ? 'Ver mapa' : 'Ver lista';
});

function attachDemoSubmit(form, successSelector) {
  form?.addEventListener('submit', event => {
    event.preventDefault();
    const success = form.querySelector(successSelector);
    if (success) success.hidden = false;
    form.reset();
  });
}

attachDemoSubmit(document.querySelector('[data-waitlist-form]'), '.form-success');

document.querySelector('[data-bar-form]')?.addEventListener('submit', event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const original = button.innerHTML;
  button.textContent = 'Interesse registrado ✓';
  event.currentTarget.reset();
  window.setTimeout(() => { button.innerHTML = original; }, 3200);
});
