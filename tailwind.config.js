/**
 * The "Card Catalog" design system.
 *
 * Every colour, typeface, and measurement the app uses is defined here, so the
 * look is consistent and can be changed in one place. The metaphor is a
 * library card catalog: warm archival paper, typewriter labels, and a coloured
 * tab on the edge of each card showing how important that person is.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./apps/web/index.html', './apps/web/src/**/*.{js,jsx}'],

  theme: {
    extend: {
      colors: {
        // Paper -- the warm off-white the whole app sits on.
        paper: {
          DEFAULT: '#FBF7EF', // card face
          aged: '#F3EBDC',    // inner mat, hover states
          deep: '#E8DECB',    // the desk the cards rest on
        },

        // Ink -- text, in three weights of emphasis.
        ink: {
          DEFAULT: '#1F1B16', // names and headings
          soft: '#6B6259',    // body text
          faint: '#9A9086',   // labels and captions
        },

        rule: {
          DEFAULT: '#D9CFBE', // hairlines between fields
          strong: '#C4B69F',  // card borders
        },

        // Priority tabs. Chosen to stay distinguishable for the most common
        // forms of colour blindness -- they differ in lightness, not just hue,
        // and each tab also carries a text label.
        priority: {
          high: '#B3452F',   // rust
          medium: '#C08A2E', // ochre
          low: '#5A7A6B',    // sage
        },

        // Follow-up status.
        overdue: '#B3452F',
        due: '#C08A2E',
        ok: '#5A7A6B',
      },

      fontFamily: {
        // Typewriter face for labels -- the card-catalog voice.
        label: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Humanist serif for names and notes -- warm, readable, printed.
        serif: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
      },

      fontSize: {
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        name: ['1.25rem', { lineHeight: '1.6rem', letterSpacing: '-0.01em' }],
      },

      borderRadius: {
        // Cards are cut paper, not rounded plastic.
        card: '2px',
      },

      boxShadow: {
        // A card resting on the one beneath it, not floating above the page.
        card: '0 1px 0 #D9CFBE',
        lifted: '0 2px 0 #C4B69F, 0 4px 12px rgba(31, 27, 22, 0.08)',
      },

      backgroundImage: {
        // The faint ruled lines of an index card.
        ruled:
          'repeating-linear-gradient(to bottom, transparent, transparent 27px, #EDE3D2 27px, #EDE3D2 28px)',
      },
    },
  },

  plugins: [],
};
