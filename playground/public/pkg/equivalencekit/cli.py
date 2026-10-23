"""Console entry point for the ``ekit`` command."""

from equivalencekit.audit import main

__all__ = ["main"]

if __name__ == "__main__":
    raise SystemExit(main())
