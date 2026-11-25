(() => {
  'use strict';

  const root = document.documentElement;
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  const backdrop = document.querySelector('.sidebar-backdrop');
  const mobile = window.matchMedia('(max-width: 1180px)');
  const preferenceKey = 'ads401.sidebar.collapsed';
  let closeMobileMenu = () => {};

  let desktopCollapsed = false;
  try {
    desktopCollapsed = localStorage.getItem(preferenceKey) === 'true';
  } catch {
    // Navigation still works when browser storage is unavailable.
  }

  if (sidebar && toggle && backdrop) {
    root.classList.add('has-site-ui');
    toggle.hidden = false;

    const setCollapsed = (collapsed, remember = false) => {
      root.classList.toggle('sidebar-collapsed', collapsed);
      root.classList.toggle('sidebar-mobile-open', mobile.matches && !collapsed);
      sidebar.inert = collapsed;
      sidebar.setAttribute('aria-hidden', String(collapsed));
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Open project menu' : 'Close project menu');
      toggle.title = collapsed ? 'Open project menu' : 'Close project menu';
      toggle.querySelector('.sidebar-toggle-label').textContent = collapsed ? 'Menu' : 'Close menu';
      toggle.querySelector('path').setAttribute('d', collapsed
        ? 'M4 6h16M4 12h16M4 18h16'
        : 'M6 6l12 12M18 6L6 18');
      backdrop.hidden = collapsed || !mobile.matches;

      if (remember && !mobile.matches) {
        desktopCollapsed = collapsed;
        try {
          localStorage.setItem(preferenceKey, String(collapsed));
        } catch {
          // The current page does not depend on saving this preference.
        }
      }
    };

    setCollapsed(mobile.matches || desktopCollapsed);
    closeMobileMenu = () => {
      if (mobile.matches) setCollapsed(true);
    };

    toggle.addEventListener('click', () => {
      setCollapsed(!root.classList.contains('sidebar-collapsed'), true);
    });
    backdrop.addEventListener('click', () => {
      setCollapsed(true);
      toggle.focus();
    });
    document.addEventListener('keydown', (event) => {
      if (root.classList.contains('preview-open')) return;
      if (event.key === 'Escape' && !root.classList.contains('sidebar-collapsed')) {
        setCollapsed(true, true);
        toggle.focus();
      }
    });
    const syncViewport = () => {
      if (sidebar.contains(document.activeElement)) toggle.focus();
      setCollapsed(mobile.matches || desktopCollapsed);
    };
    if (mobile.addEventListener) {
      mobile.addEventListener('change', syncViewport);
    } else {
      mobile.addListener(syncViewport);
    }

    // Keep keyboard navigation inside an open mobile menu and its toggle.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || !mobile.matches || backdrop.hidden
        || root.classList.contains('preview-open')) return;
      const focusable = [toggle, ...sidebar.querySelectorAll('a[href], button:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !focusable.includes(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !focusable.includes(current))) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  const sections = [...document.querySelectorAll('.page-view')];
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const sectionAliases = { main: 'overview', results: 'evaluation-method' };
  let updateSectionNavigation = () => {};

  if (sections.length && sidebar) {
    const links = [...sidebar.querySelectorAll('.nav-link')];
    document.title = 'ADS401 Group I | Research Project';
    root.classList.remove('presentation-mode');
    sections.forEach((section) => { section.hidden = false; });
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto';

    const markSection = (id) => {
      links.forEach((link) => {
        const current = link.getAttribute('href') === '#' + id;
        link.classList.toggle('active', current);
        if (current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };

    updateSectionNavigation = () => {
      const readingLine = Math.min(180, window.innerHeight * 0.28);
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= readingLine) current = section;
        else break;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 3) {
        current = sections[sections.length - 1];
      }
      markSection(current.id);
    };

    const requestPresentationPreview = () => {
      const open = () => window.requestAnimationFrame(() => {
        // Run after the preview's history listeners have closed an older popup.
        if (location.hash === '#presentation3') {
          window.dispatchEvent(new CustomEvent('ads401:preview-presentation'));
        }
      });
      if (window.ads401DocumentPreview) open();
      else window.addEventListener('ads401:preview-ready', open, { once: true });
    };

    const followLegacyAnchor = () => {
      let hash;
      try {
        hash = decodeURIComponent(location.hash.slice(1));
      } catch {
        return;
      }
      if (hash === 'presentation3') {
        requestPresentationPreview();
        return;
      }
      const target = sectionById.get(sectionAliases[hash]);
      if (target) {
        history.replaceState(history.state, '', '#' + target.id);
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        // Charts above an old deep link can finish loading after the first layout.
        if (document.readyState !== 'complete') {
          window.addEventListener('load', () => {
            target.scrollIntoView({ block: 'start', behavior: 'instant' });
          }, { once: true });
        }
      }
      updateSectionNavigation();
    };

    // Keep real fragment links and the browser's native anchor history.
    // Wheel scrolling only changes the highlighted link, never the URL.
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey
        || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('a[href^="#"]');
      if (!link || (link.target && link.target !== '_self')) return;
      const target = sectionById.get(link.getAttribute('href').slice(1));
      if (!target) return;
      closeMobileMenu();
      window.requestAnimationFrame(() => {
        target.querySelector('h1')?.focus({ preventScroll: true });
      });
    });

    window.addEventListener('hashchange', followLegacyAnchor);
    window.addEventListener('load', updateSectionNavigation, { once: true });
    followLegacyAnchor();
    updateSectionNavigation();
  }

  const cards = [...document.querySelectorAll('.content-section')];
  if (!cards.length) return;

  const clamp = (value) => Math.max(0, Math.min(1, value));
  let framePending = false;
  const updateCardOpacity = () => {
    framePending = false;
    updateSectionNavigation();
    const height = window.innerHeight;
    const fadeBand = Math.min(160, height * 0.2);
    const interiorHeight = Math.max(1, height - fadeBand * 2);

    for (const card of cards) {
      const bounds = card.getBoundingClientRect();
      const edgeDistance = Math.min(bounds.top, height - bounds.bottom);
      const edgeStrength = clamp(edgeDistance / fadeBand);

      // A long section spanning the reading area stays legible instead of
      // remaining faded simply because its top and bottom are off screen.
      const interiorCoverage = clamp((Math.min(bounds.bottom, height - fadeBand)
        - Math.max(bounds.top, fadeBand)) / interiorHeight);
      const oversizedRelief = clamp((bounds.height - interiorHeight) / (fadeBand * 2))
        * interiorCoverage;
      const opacity = 0.5 + 0.5 * Math.max(edgeStrength, oversizedRelief);
      card.style.setProperty('--edge-opacity', opacity.toFixed(3));
    }
  };
  const requestOpacityUpdate = () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(updateCardOpacity);
  };

  window.addEventListener('scroll', requestOpacityUpdate, { passive: true });
  window.addEventListener('resize', requestOpacityUpdate, { passive: true });
  window.addEventListener('load', requestOpacityUpdate, { once: true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(requestOpacityUpdate);
    cards.forEach((card) => observer.observe(card));
  }
  updateCardOpacity();
})();
