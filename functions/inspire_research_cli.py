"""Local operator commands, offline by default; never a website endpoint."""
import argparse
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
# Embedded Windows Python can omit the script directory from sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from inspire_research import ResearchRunner
from inspire_research_store import ResearchStore, ResearchHold


def main():
    parser = argparse.ArgumentParser(description="INSPIRE isolated research safeguards; offline by default, external approvals required for HTTPS")
    parser.add_argument("command", choices=["init-offline", "init-draft", "status", "preview", "execute", "replay", "recover", "review", "purge", "retention-watch", "revoke", "source-disclosure", "approval-disclosure", "import-owner-decision", "import-token-receipt", "release"])
    parser.add_argument("--trial", required=True)
    parser.add_argument("--storage-name", default="quarantine-v1")
    parser.add_argument("--conversation", choices=["C1", "C2", "C3", "C4"])
    parser.add_argument("--operation")
    parser.add_argument("--preview-hash")
    parser.add_argument("--retention-days", type=int, default=7)
    parser.add_argument("--reviewer", help="Must match a configured reviewer in this trial")
    parser.add_argument("--review-json", help="Local JSON review file, or - for stdin; configured reviewers and exact candidate hash required")
    parser.add_argument("--owner-document")
    parser.add_argument("--document-sha256")
    parser.add_argument("--owner-reference")
    parser.add_argument("--real-model", action="store_true", help="Research HTTPS backend; still requires all owner/source/token/admission gates")
    parser.add_argument("--emulator-token-stdin", action="store_true",
                        help="Read a synthetic registered emulator ID token from stdin; never persist it")
    args = parser.parse_args()
    root = ResearchStore.default_root(args.storage_name)
    create = args.command.startswith("init-") and not root.exists()
    store = ResearchStore(root, create=create)
    admission = None
    if args.emulator_token_stdin:
        from inspire_research_admission import EmulatorAdmission
        token = sys.stdin.read(16000).strip()
        if not token or len(token) > 8192:
            raise ResearchHold("INVALID_EMULATOR_TOKEN")
        admission = EmulatorAdmission(lambda: token)
    transport = None
    if args.real_model:
        from inspire_research_live import ResearchHTTPS
        transport = ResearchHTTPS()
    runner = ResearchRunner(store, transport=transport, admission=admission)
    if not args.command.startswith("init-"):
        runner.purge(args.trial)
    if args.command.startswith("init-"):
        value = runner.create(args.trial, offline=args.command == "init-offline", retention_days=args.retention_days)
    elif args.command == "preview":
        value = runner.preview(args.trial, args.conversation)
    elif args.command == "execute":
        value = runner.execute(args.trial, args.conversation, preview_hash=args.preview_hash, operation_id=args.operation)
    elif args.command == "replay":
        value = runner.replay(args.trial, args.operation)
    elif args.command == "recover":
        value = runner.recover(args.trial)
    elif args.command == "approval-disclosure":
        value = runner.approval_preview(args.trial, args.conversation)
    elif args.command == "source-disclosure":
        value = runner.source_disclosure(args.trial)
    elif args.command == "review":
        from pathlib import Path
        if args.review_json == "-" and args.emulator_token_stdin:
            raise ResearchHold("SEPARATE_REVIEW_AND_IDENTITY_INPUT_REQUIRED")
        review = json.loads(sys.stdin.read(16000) if args.review_json == "-" else Path(args.review_json).read_text(encoding="utf8"))
        if set(review) != {"accept", "scores", "flags", "expected_sha256"}:
            raise ResearchHold("INVALID_REVIEW_FIELDS")
        value = runner.review(args.trial, args.operation, args.reviewer, **review)
    elif args.command == "import-owner-decision":
        value = runner.import_owner_decision(args.trial, args.owner_document, args.document_sha256, args.owner_reference)
    elif args.command == "import-token-receipt":
        runner.import_token_receipt(args.trial, args.owner_document, args.document_sha256)
        value = runner.status(args.trial)
    elif args.command == "release":
        value = runner.release(args.trial, args.document_sha256)
    elif args.command == "purge":
        runner.purge(args.trial)
        value = runner.status(args.trial)
    elif args.command == "retention-watch":
        value = runner.watch_retention(args.trial)
    elif args.command == "revoke":
        runner.revoke(args.trial)
        value = runner.status(args.trial)
    else:
        value = runner.status(args.trial)
    # JSON escaping prevents terminal control sequences/HTML execution.
    print(json.dumps(value, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except ResearchHold as error:
        print(json.dumps({"held": str(error), "live_enabled": False, "user_delivery": False}), file=sys.stderr)
        sys.exit(2)
