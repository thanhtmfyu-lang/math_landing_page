"""Plan/stage public PDFs with the existing MTM stamper; never overwrite sources.

No reference, version hash, deployment, or private document is changed here.
The owner must repin references and run rendered QA before release.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(root, output, stage=False, stamp=None):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output == root or root in output.parents:
        raise ValueError('Output must be outside the repository; public sources are read-only.')
    output.mkdir(parents=True, exist_ok=True)
    if stage and stamp is None:
        spec = importlib.util.spec_from_file_location('mtm_existing_watermark', root / 'tools/watermark/dong_dau.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        stamp = module.dong
    records = []
    for source in sorted((root / 'public').rglob('*.pdf')):
        if source.is_symlink() or root not in source.resolve().parents:
            raise ValueError('Public source escapes repository.')
        before = digest(source)
        record = {'source': source.relative_to(root).as_posix(), 'sourceSha256': before, 'sourceBytes': source.stat().st_size, 'staged': False}
        if stage:
            candidate = output / (before + '.candidate.pdf')
            stamp(source, candidate)
            if digest(source) != before:
                raise RuntimeError('Stamper changed source bytes.')
            after = digest(candidate)
            target = output / (after + '.pdf')
            if target.exists():
                if digest(target) != after:
                    raise RuntimeError('Conflicting staged file.')
                candidate.unlink()
            else:
                candidate.replace(target)
            record.update({'staged': True, 'stagedSha256': after, 'stagedBytes': target.stat().st_size, 'stagedFile': target.name})
        records.append(record)
    report = {'version': 1, 'status': 'staged-needs-reference-repin-and-rendered-QA' if stage else 'plan-only', 'sourceFilesUnchanged': True, 'pdfs': records,
              'pending': ['repin document references, bytes and version hashes', 'render and inspect each changed PDF', 'watermark downloadable question image bytes', 'owner merges and deploys']}
    (output / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--stage', action='store_true', help='Create review copies outside repository; source bytes stay unchanged.')
    args = parser.parse_args()
    report = prepare(args.root, args.output, args.stage)
    print(json.dumps({'status': report['status'], 'pdfs': len(report['pdfs'])}))
