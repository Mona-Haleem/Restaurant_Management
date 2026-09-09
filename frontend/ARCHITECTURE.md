# Architecture

The project is organized by responsibility and user role to keep the codebase clear and maintainable.

* `core/` — App-wide services, guards, and interceptors.
* `shared/` — Reusable components, pipes, and directives.
* `features/customer/` — Customer-specific functionality.
* `features/worker/` — Worker-specific functionality.
* `features/manager/` — Manager-specific functionality.
* `models/` — Shared TypeScript interfaces and types.

The role-based feature folders will align with the lazy-loaded route groups, while shared infrastructure remains separated from feature-specific code.
