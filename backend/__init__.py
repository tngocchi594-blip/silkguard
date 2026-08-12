"""SilkGuard V2 backend package."""
"""SilkGuard V2 backend package.

Local secrets are loaded before database and integration modules read their
configuration. The file is deliberately excluded from version control.
"""

from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
