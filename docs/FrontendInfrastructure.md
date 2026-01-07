# Frontend Infrastructure Decision

- Renderer remains JavaScript for now; TypeScript migration is deferred.
- Tailwind is consumed via the precompiled prototype stylesheet at `styles/globals.css`.
- If new UI work introduces additional utility classes, add a Tailwind build step before expanding UI scope.
