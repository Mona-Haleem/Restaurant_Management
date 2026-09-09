# Contributing

## Branch Strategy

This project uses a **trunk-based development** strategy.

The `main` branch is the primary branch and should remain stable.

### Branch Naming

Short-lived branches should be created from `main` using the following naming conventions:

* `feature/<short-description>` — for new features
* `fix/<short-description>` — for bug fixes
* `chore/<short-description>` — for maintenance, configuration, or other non-feature work

Examples:

* `feature/user-authentication`
* `fix/login-validation`
* `chore/update-dependencies`

### Workflow

1. Create a short-lived branch from `main`.
2. Make and commit the changes on that branch.
3. Push the branch to the remote repository.
4. Open a Pull Request targeting `main`.
5. Review and merge the Pull Request into `main`.
6. Delete the branch after it has been merged.

A separate `develop` branch is not used because it adds unnecessary overhead for this small project.
