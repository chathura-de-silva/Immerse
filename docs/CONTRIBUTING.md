# Contributing to Immerse

First off, thank you for considering contributing to Immerse! It's people like you that make open-source tools great. 

## How Can I Contribute?

### Reporting Bugs
If you find a bug, please open an issue on the repository. When reporting, please include:
* Your browser version and operating system.
* Clear, step-by-step instructions to reproduce the bug.
* Screenshots or console error logs, if applicable.

### Suggesting Enhancements
Have an idea to make Immerse even better? We'd love to hear it! Open an issue and describe the feature, why you need it, and how you envision it working.

### Submitting Pull Requests
1. Fork the repository.
2. Create a new branch for your feature or bugfix (`git checkout -b feature-name`).
3. Make your changes (primarily in the `src/` or `popup/` directories).
4. If applicable, add or update tests in the `tests/` directory.
5. Run the build script to bundle the extension assets (`node scripts/build.js`).
6. Test your changes locally in your browser by reloading the unpacked extension.
7. Commit your changes with clear messages (`git commit -m 'Add some feature'`).
8. Push to the branch (`git push origin feature-name`).
9. Open a Pull Request. Make sure to include a proper description and a title matching conventional commit messages.(ex - `feat: add new feature`, `fix: resolve issue with image loading`).

## Development Setup

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Clone the repository and navigate into it.
3. Install dependencies:
   ```bash
   npm install
   ```
4. To build the extension files:
   ```bash
   node scripts/build.js
   ```
5. To run the test suite:
   ```bash
   node --test tests
   ```
