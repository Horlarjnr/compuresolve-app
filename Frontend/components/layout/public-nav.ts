// Single source of truth for the public pages (landing, about): navigation links and the content width.
export const PUBLIC_NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Features', href: '/#features' },
  { label: 'How It Works', href: '/#how' },
  { label: 'FAQ', href: '/about' },
  { label: 'Contact', href: '/about' },
];

// Backgrounds run 100% of the browser width; content sits in this centred container.
export const PUBLIC_WRAP = 'mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-10';
