// Theme definitions for Aurora
// Each theme maps to CSS custom properties applied at runtime

export const THEMES = {
  galaxia: {
    id: 'galaxia',
    name: 'Galaxia',
    description: 'Modo oscuro con acentos de neón',
    preview: '#00f3ff',
    dark: true,
    vars: {
      '--bg':         '#0a0b10',
      '--s1':         '#13151f',
      '--s2':         '#1c1e2b',
      '--brd':        '#2a2d3e',
      '--navy':       '#00f3ff',
      '--navy-light': 'rgba(0,243,255,0.15)',
      '--navy-hover': '#00c3cc',
      '--navy-text':  '#000000',
      '--accent':     '#00f3ff',
      '--text':       '#f1f5f9',
      '--muted':      '#94a3b8',
      '--green':      '#10b981',
      '--red':        '#ef4444',
      '--yel':        '#f59e0b',
      '--blue':       '#3b82f6',
      '--danger':     '#ef4444',
    }
  },
  corporativo: {
    id: 'corporativo',
    name: 'Corporativo',
    description: 'Limpio y profesional',
    preview: '#0176D3',
    dark: false,
    vars: {
      '--bg':         '#F4F6F9',
      '--s1':         '#FFFFFF',
      '--s2':         '#EEF2F6',
      '--brd':        '#C8D0DA',
      '--navy':       '#0176D3',
      '--navy-light': '#D4E9F9',
      '--navy-hover': '#014486',
      '--navy-text':  '#ffffff',
      '--accent':     '#0176D3',
      '--text':       '#181818',
      '--muted':      '#5A6472',
      '--green':      '#04844B',
      '--red':        '#C23934',
      '--yel':        '#E58A1F',
      '--blue':       '#00A1E0',
      '--danger':     '#C23934',
    }
  },
  coral: {
    id: 'coral',
    name: 'Coral',
    description: 'Cálido y acogedor',
    preview: '#FF5A5F',
    dark: false,
    vars: {
      '--bg':         '#FFF8F7',
      '--s1':         '#FFFFFF',
      '--s2':         '#FFF1EE',
      '--brd':        '#FFD5CB',
      '--navy':       '#FF5A5F',
      '--navy-light': 'rgba(255,90,95,0.12)',
      '--navy-hover': '#E0454A',
      '--navy-text':  '#ffffff',
      '--accent':     '#FF5A5F',
      '--text':       '#222222',
      '--muted':      '#777777',
      '--green':      '#00A699',
      '--red':        '#C23934',
      '--yel':        '#FC642D',
      '--blue':       '#007A87',
      '--danger':     '#C23934',
    }
  },
  rosa: {
    id: 'rosa',
    name: 'Rosa',
    description: 'Blanco con rosa mexicano',
    preview: '#E91E8C',
    dark: false,
    vars: {
      '--bg':         '#FAFAFA',
      '--s1':         '#FFFFFF',
      '--s2':         '#FDF0F7',
      '--brd':        '#F0CDE3',
      '--navy':       '#E91E8C',
      '--navy-light': 'rgba(233,30,140,0.10)',
      '--navy-hover': '#C21577',
      '--navy-text':  '#ffffff',
      '--accent':     '#E91E8C',
      '--text':       '#1a1a1a',
      '--muted':      '#666666',
      '--green':      '#2ecc71',
      '--red':        '#e74c3c',
      '--yel':        '#f39c12',
      '--blue':       '#3498db',
      '--danger':     '#e74c3c',
    }
  },
  notion: {
    id: 'notion',
    name: 'Notion',
    description: 'Minimalista inspirado en Notion',
    preview: '#2F3438',
    dark: false,
    vars: {
      '--bg':         '#F7F6F3',
      '--s1':         '#FFFFFF',
      '--s2':         '#EFEDE9',
      '--brd':        '#E0DDD8',
      '--navy':       '#2F3438',
      '--navy-light': 'rgba(47,52,56,0.08)',
      '--navy-hover': '#1A1D1F',
      '--navy-text':  '#ffffff',
      '--accent':     '#35ACDF',
      '--text':       '#37352F',
      '--muted':      '#9B9A97',
      '--green':      '#0F7B6C',
      '--red':        '#E03E3E',
      '--yel':        '#DFAB01',
      '--blue':       '#35ACDF',
      '--danger':     '#E03E3E',
    }
  }
};


export const DEFAULT_THEME = 'galaxia';
export const THEME_STORAGE_KEY = 'crm_theme';

export function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });
  localStorage.setItem(THEME_STORAGE_KEY, themeId);
  // Update btng text color based on theme
  // (injected as a CSS variable --navy-text)
}

export function loadSavedTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  applyTheme(saved);
  return saved;
}
