# Dice

A simple dice roller that runs in the browser. No dependencies, no build step.

## Files

- `index.html` — markup and structure
- `style.css` — all styling and layout
- `script.js` — game logic, animations, state

## Usage

Open `index.html` in any browser. All three files need to be in the same folder.

## Features

Roll up to three dice at once. Click any individual die to re-roll just that one. Stats like average, best, worst, and streak are tracked during the session. Past rolls show up in the history strip at the bottom.

Keyboard shortcuts work on desktop: Space or Enter to roll all, R to reset, and 1 / 2 / 3 to roll a single die by index.

## Notes

Everything resets on page refresh. There is no persistent storage — it is meant to be lightweight and stateless.
