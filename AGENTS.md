# AGENTS.md

## Project Overview

- This is a TypeScript Hono API server for a multi-agent chat room.
- Runtime entry is `src/index.ts`.
- API routes live in `src/routes/`.
- Business helpers live in `src/service/`.
- Runtime managers live in `src/manager/`.
- Shared TypeScript models live in `src/model/`.
- Environment defaults live in `src/config/env.ts`; local secrets belong in `.env` and must not be committed.

## Commands

- Use `npm run dev` to start the local server.
- Use `npm run build` to type-check and build with `tsc`.
- Use `npm run lint` to run ESLint.
- Use `npm run lint:fix` only when formatting/lint fixes are intended.

## Code Style

- Keep code simple and direct. Do not add factories, wrappers, helper functions, classes, options objects, or extra abstraction layers unless they are clearly used by current code.
- Prefer deleting unused or speculative logic over keeping it for possible future use.
- Avoid “pass-through” functions that only call another function with the same arguments.
- Avoid constructor/options parameters that are not used by real callers.
- Keep public APIs small. Make methods private unless routes or other modules need them.
- Preserve existing behavior when simplifying, especially multi-agent conversation flow and SSE/event output.
- Keep TypeScript types aligned with actual runtime inputs. Remove unused interfaces and fields.
- Follow the existing ESLint/Antfu style: no semicolons, single quotes, concise arrow functions where appropriate.
- Do not add comments unless they explain non-obvious behavior. Remove stale comments when deleting related logic.

## Multi-Agent Behavior

- Main behavior to protect is multi-agent conversation through `POST /api/messages`.
- Validate changes with at least two agents and `maxRounds: 2` when touching room, agent, or AI client code.
- Health or toy endpoints are lower priority than the multi-agent flow.

## Validation

- Run `npm run build` after TypeScript changes.
- Run `npm run lint` before committing.
- For manager/route changes, start `npm run dev` and smoke test the relevant API endpoints with `curl`.
- Do not treat unrelated pre-existing runtime errors as part of the task unless the user asks.

## Commit Messages

- Match the existing Conventional Commit style.
- Use lowercase type prefixes such as `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, or `test:`.
- Keep the subject concise and imperative/lowercase after the prefix when possible.
- Examples:
  - `feat: split public and internal room events`
  - `refactor: simplify multi-agent room code`
  - `docs: add agent coding guidelines`
- Before committing, check recent history with `git log --oneline -5` and align the message style.
