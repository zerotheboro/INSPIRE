"""Reuse existing Auth/quota/IP checks through a private stdin-only Node CLI."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from inspire_research_store import ResearchHold, canonical


class EmulatorAdmission:
    def __init__(self, token_provider):
        self.token_provider = token_provider
        self.root = Path(__file__).resolve().parents[1]

    def _call(self, action, **data):
        if os.environ.get("NODE_ENV") == "production":
            raise ResearchHold("PRODUCTION_CLOSED")
        node = shutil.which("node")
        if not node:
            raise ResearchHold("NODE_REQUIRED_FOR_SHARED_ADMISSION")
        value = {"action": action, "token": self.token_provider(), **data}
        env = {**os.environ, "FIREBASE_AUTH_EMULATOR_HOST": "127.0.0.1:9099",
               "FIRESTORE_EMULATOR_HOST": "127.0.0.1:8080", "METADATA_SERVER_DETECTION": "none"}
        result = subprocess.run([node, "--import", (self.root / "tests/register-ts.mjs").as_uri(),
                                 str(self.root / "functions/src/inspireResearchAdmission.ts")],
                                input=canonical(value).decode(), capture_output=True, text=True,
                                encoding="utf8", cwd=self.root, env=env, timeout=30,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode:
            raise ResearchHold("SHARED_AUTH_QUOTA_OR_IP_ADMISSION_HOLD")
        try:
            return json.loads(result.stdout)
        except ValueError as error:
            raise ResearchHold("ADMISSION_RESPONSE_HOLD") from error

    def identity(self):
        return self._call("identity")

    def reserve(self, request, subject):
        return self._call("reserve", request=request, subject=subject)

    def settle(self, operation, subject, validated_sha256):
        return self._call("settle", operation=operation, subject=subject, validatedSha256=validated_sha256)
